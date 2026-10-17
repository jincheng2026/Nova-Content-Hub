import path from 'node:path';
import { fileURLToPath } from 'node:url';

const commands = {
  backup: ['library', 'destination'],
  verify: ['backup'],
  restore: ['backup', 'destination'],
  'import-browser': ['source', 'destination'],
  'import-status': ['destination'],
  'resume-import': ['destination', 'id'],
};
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const problem = (code, message) => Object.assign(new Error(message), { code });

export async function main(argv) {
  let output;
  try {
    const [command = 'help', ...args] = argv;
    if (command === 'help') {
      if (args.length) throw problem('INVALID_ARGUMENTS', 'help 不接受参数。');
      output = { ok: true, commands: ['backup --library ROOT --destination NEW_DIRECTORY', 'verify --backup BACKUP_DIRECTORY', 'restore --backup BACKUP_DIRECTORY --destination NEW_DIRECTORY',
        'import-browser --source BACKUP_JSON --destination NEW_DIRECTORY', 'import-status --destination NEW_DIRECTORY [--id IMPORT_ID]', 'resume-import --destination NEW_DIRECTORY --id IMPORT_ID'], imageGeneration: false,
        message: '备份、核验、恢复和导入本地数据。导入可按同一操作编号查询或继续；没有生图、宿主启动或授权模式开关。' };
    } else {
      if (!Object.hasOwn(commands, command)) throw problem('INVALID_ARGUMENTS', '使用 help 查看维护命令。');
      const required = commands[command];
      const allowed = command === 'import-status' ? [...required, 'id'] : required;
      const values = {};
      for (let i = 0; i < args.length; i += 2) {
        const key = args[i].startsWith('--') ? args[i].slice(2) : '';
        const value = args[i + 1];
        if (!allowed.includes(key) || Object.hasOwn(values, key) || !value || value.startsWith('--') || value.includes('\0') || !(key === 'id' ? UUID.test(value) : path.isAbsolute(value))) {
          throw problem('INVALID_ARGUMENTS', '只接受命令对应的绝对路径和导入编号；参数不能重复。');
        }
        values[key] = value;
      }
      if (required.some(key => !Object.hasOwn(values, key))) throw problem('INVALID_ARGUMENTS', '缺少命令所需参数。');
      let result;
      if (['import-browser', 'import-status', 'resume-import'].includes(command)) {
        const { importBrowserBackup, getBrowserImport, resumeBrowserImport } = await import('../browser-import/index.mjs');
        result = command === 'import-browser' ? await importBrowserBackup(values.source, values.destination)
          : command === 'import-status' ? getBrowserImport(values.destination, values.id) : await resumeBrowserImport(values.destination, values.id);
      } else {
        const { backupLibrary, verifyBackup, restoreBackup } = await import('../file-library/index.mjs');
        result = command === 'backup' ? backupLibrary(values.library, values.destination)
          : command === 'verify' ? verifyBackup(values.backup) : restoreBackup(values.backup, values.destination);
      }
      output = { ok: true, result };
    }
  } catch (error) {
    output = { ok: false, code: error.code || 'IO_ERROR', message: error.message };
    for (const field of ['outcome', 'backupId', 'backupDir', 'root', 'stage', 'importId', 'workDirectory', 'destination']) if (error[field]) output[field] = error[field];
    if (error.cause?.code) output.ioCode = error.cause.code;
  }
  process.stdout.write(JSON.stringify(output) + '\n');
  return output.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) process.exitCode = await main(process.argv.slice(2));
