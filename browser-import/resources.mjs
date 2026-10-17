import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateImportedRaster } from "../image-validation/index.mjs";
import { sourceReferences } from "./inspect.mjs";
import { ensure, read, parse, publish, stat } from "./operation.mjs";

const HASH = /^[a-f0-9]{64}$/;
function corrupt(message) { throw Object.assign(Error(message), {code:'CORRUPT_IMPORT'}); }
function checkResult(row, reference) {
  const fields=['format','schemaVersion','key','role','status','code','assetHash','bytes','detectedType','decoded','width','height','frames'];
  if(!row || typeof row!=='object' || Array.isArray(row) || Object.keys(row).some(key=>!fields.includes(key)) || row.format!=='nova-browser-import-resource' || row.schemaVersion!==1 || row.key!==reference.key || row.role!==reference.role || !['available','unavailable','unsupported'].includes(row.status) || !Number.isSafeInteger(row.bytes) || row.bytes<0 || row.bytes>64*1024*1024 || !(row.assetHash===null?row.bytes===0:typeof row.assetHash==='string'&&HASH.test(row.assetHash)) || typeof row.decoded!=='boolean' || !(row.status==='available'?row.code===null&&!!row.assetHash:typeof row.code==='string') || !(row.detectedType===null||typeof row.detectedType==='string')) corrupt('Malformed persisted resource result');
  if(row.decoded && (!['image/png','image/jpeg','image/webp','image/gif'].includes(row.detectedType) || ![row.width,row.height,row.frames].every(value=>Number.isSafeInteger(value)&&value>0))) corrupt('Malformed raster evidence');
}
const catalogFile = fileURLToPath(
  new URL("./builtin-resources.json", import.meta.url),
);
const bundleRoot = fileURLToPath(new URL("../原型/", import.meta.url));
const SOURCE_ERRORS = new Set([
  "INVALID_DATA_URL",
  "INVALID_IMAGE",
  "UNSUPPORTED_IMAGE",
  "IMAGE_LIMIT_EXCEEDED",
  "UNSUPPORTED_RESOURCE",
]);
const imageRoles = new Set([
  "photo",
  "avatar",
  "candidate",
  "published-cover",
  "template-reference",
  "template-preview",
  "template-restoration",
]);
const MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "application/json",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/octet-stream",
]);
function embedded(value) {
  const m = /^data:([^\s,;]*);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!m || !MIME.has(m[1]) || m[2].length % 4)
    throw Object.assign(Error("Unsupported or malformed data URL"), {
      code: "INVALID_DATA_URL",
    });
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.toString("base64") !== m[2])
    throw Object.assign(Error("Noncanonical base64"), {
      code: "INVALID_DATA_URL",
    });
  if (bytes.length > 64 * 1024 * 1024)
    throw Object.assign(Error("Encoded resource exceeds limit"), {
      code: "IMAGE_LIMIT_EXCEEDED",
    });
  return bytes;
}
export async function resolveResources(state, ctx) {
  const target = path.join(ctx.work, "resources.json"),
    existing = parse(target, true);
  if (existing) {
    const references=sourceReferences(state);
    if(!Array.isArray(existing)||existing.length!==references.length)corrupt("Resource manifest count differs");
    existing.forEach((row,index)=>checkResult(row,references[index]));
    for (const r of existing)
      if (
        r.assetHash &&
        ctx.sha(read(path.join(ctx.work, "pinned-resources", r.assetHash))) !==
          r.assetHash
      )
        throw Object.assign(Error("Pinned resource changed"), {
          code: "CORRUPT_IMPORT",
        });
    return existing;
  }
  ensure(path.join(ctx.work, "pinned-resources"));
  ensure(path.join(ctx.work, "resource-results"));
  const rawCatalog = read(catalogFile),
    catalog = JSON.parse(rawCatalog),
    catalogHash = ctx.sha(rawCatalog);
  if (
    catalog.format !== "nova-browser-import-builtin-resources" ||
    catalog.schemaVersion !== 1
  )
    throw Error("Unsupported builtin catalog");
  publish(
    path.join(ctx.work, "catalog-binding.json"),
    ctx.json({ schemaVersion: 1, sha256: catalogHash }),
  );
  const results = [],
    decodedCache = new Map();
  async function decode(bytes) {
    const key = ctx.sha(bytes),
      cached = decodedCache.get(key);
    if (cached) {
      if (cached.error) throw cached.error;
      return cached.result;
    }
    ctx.hook("beforeRasterDecode", { assetHash: key });
    try {
      const result = await validateImportedRaster(bytes);
      decodedCache.set(key, { result });
      return result;
    } catch (error) {
      if (SOURCE_ERRORS.has(error.code)) decodedCache.set(key, { error });
      throw error;
    }
  }
  for (const reference of sourceReferences(state)) {
    const reportFile = path.join(
        ctx.work,
        "resource-results",
        `${ctx.sha(Buffer.from(reference.key))}.json`,
      ),
      prior = parse(reportFile, true);
    if (prior) {
      checkResult(prior,reference);
      if (prior.key !== reference.key) throw Error("Resource key mismatch");
      if (
        prior.assetHash &&
        ctx.sha(
          read(path.join(ctx.work, "pinned-resources", prior.assetHash)),
        ) !== prior.assetHash
      )
        throw Object.assign(Error("Pinned resource changed"), {
          code: "CORRUPT_IMPORT",
        });
      results.push(prior);
      continue;
    }
    const row = {
      format:"nova-browser-import-resource",schemaVersion:1,
      key: reference.key,
      role: reference.role,
      status: "unavailable",
      code: "MISSING_BYTES",
      assetHash: null,
      bytes: 0,
      detectedType: null,
      decoded: false,
    };
    let bytes;
    try {
      const source = reference.source;
      if (source?.startsWith("data:")) bytes = embedded(source);
      else if (source && Object.hasOwn(catalog.entries, source)) {
        const entry = catalog.entries[source];
        if (
          entry.path !== source ||
          typeof entry.path!=="string" || entry.path.includes("\\") || entry.path.startsWith("/") || entry.path.split("/").some(part=>!part||part==="."||part==="..") || !HASH.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes<0 || entry.bytes>64*1024*1024 ||
          !["raster", "structure"].includes(entry.kind)
        )
          throw Error("Builtin catalog entry mismatch");
        const full = path.join(bundleRoot, ...entry.path.split("/")); // Only catalog-authored paths reach the filesystem.
        try {
          bytes = read(full);
        } catch (error) {
          throw Object.assign(Error("Bundled reference is missing"), {
            code: "BUILTIN_CHANGED",
            cause: error,
          });
        }
        if (bytes.length !== entry.bytes || ctx.sha(bytes) !== entry.sha256)
          throw Object.assign(
            Error("Bundled reference differs from exact catalog"),
            { code: "BUILTIN_CHANGED" },
          );
      } else if (source) row.code = "REFERENCE_UNAVAILABLE";
      if (bytes) {
        row.assetHash = ctx.sha(bytes);
        row.bytes = bytes.length;
        publish(path.join(ctx.work, "pinned-resources", row.assetHash), bytes);
        const svg = /^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(
          bytes.toString("utf8"),
        );
        if (svg) {
          if (!reference.role.startsWith("template-"))
            throw Object.assign(
              Error("SVG cannot stand in for a raster original"),
              { code: "UNSUPPORTED_IMAGE" },
            );
          row.detectedType = "image/svg+xml";
          row.status = "available";
          row.code = null;
        } else if (
          imageRoles.has(reference.role) ||
          reference.role === "template-resource"
        ) {
          const decoded = await decode(bytes);
          Object.assign(row, {
            status: "available",
            code: null,
            detectedType: `image/${decoded.format}`,
            decoded: true,
            width: decoded.width,
            height: decoded.height,
            frames: decoded.frames,
          });
        } else {
          const raster =
            bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
            (bytes[0] === 255 && bytes[1] === 216) ||
            ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString()) ||
            (bytes.subarray(0, 4).toString() === "RIFF" &&
              bytes.subarray(8, 12).toString() === "WEBP");
          if (raster) {
            const decoded = await decode(bytes);
            Object.assign(row, {
              detectedType: `image/${decoded.format}`,
              decoded: true,
              width: decoded.width,
              height: decoded.height,
              frames: decoded.frames,
            });
          } else if (bytes.subarray(0, 5).toString() === "%PDF-")
            row.detectedType = "application/pdf";
          else {
            let value;
            try {
              value = new TextDecoder("utf8", { fatal: true }).decode(bytes);
            } catch {
              throw Object.assign(Error("Unsupported binary attachment"), {
                code: "UNSUPPORTED_RESOURCE",
              });
            }
            if (value.includes("\0"))
              throw Object.assign(Error("Unsupported binary attachment"), {
                code: "UNSUPPORTED_RESOURCE",
              });
            row.detectedType = "text/plain";
            if (/^\s*[\[{]/.test(value)) {
              try {
                JSON.parse(value);
                row.detectedType = "application/json";
              } catch {}
            }
          }
          row.status = "available";
          row.code = null;
        }
      }
    } catch (error) {
      if (!SOURCE_ERRORS.has(error.code)) throw error;
      row.status =
        error.code === "UNSUPPORTED_IMAGE" ? "unsupported" : "unavailable";
      row.code = error.code || "INVALID_RESOURCE";
    }
    ctx.hook("beforeResourceResult", { key: reference.key });
    publish(reportFile, ctx.json(row));
    ctx.hook("afterResourceResult", { key: reference.key });
    results.push(row);
  }
  publish(target, ctx.json(results));
  return results;
}
export function pinnedResource(ctx, result, purpose) {
  if (!result || result.status !== "available") return null;
  const file = path.join(ctx.work, "pinned-resources", result.assetHash);
  return ctx.asset(file, result.assetHash, purpose);
}
