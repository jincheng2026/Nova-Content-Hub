# 栅格字节校验

`validateImage(bytes)` 是已有静态封面收件合约：仅完整解码的静态 PNG/JPEG/WebP，原错误/返回语义保持不变，GIF/APNG/动画 WebP
不进入该路径。

`await validateImportedRaster(bytes)` 供浏览器导入及照片补文件使用。输入必须为非空 Buffer；返回
`{format,width,height,frames,assetHash,bytes,decoded:true}`，其中宽高是单帧显示尺寸，JPEG EXIF 5/6/7/8 交换宽高。SHA256
始终针对原始压缩 bytes；既不转码、缩放、剥离 EXIF，也不将 raw 像素回写源资产。

静态 PNG/JPEG/WebP 复用 validateImage 完整像素验证；GIF/动画 WebP 使用实际安装的 sharp 全页 `animated:true`、
`failOn:'warning'`、`sequentialRead:true`，drain 全部 RGBA 输出并核对每帧尺寸、帧数及实际输出字节总量。GIF 先检查完整块/子块和最终
trailer；sharp 会容忍坏尾并少报帧数，不能单独依赖 metadata 或首帧。WebP 同时检查 RIFF 完整长度、分块界限、ANMF 数量。APNG/acTL
明确拒绝，当前没有其全帧解码证明。

固定导出 `IMPORTED_RASTER_LIMITS`：编码文件最多 64 MiB、全部帧合计最多 40,000,000 像素、最多 256 帧、实际 RGBA 输出最多
160,000,000 字节。逐图调用和 drain 不在应用层积存所有帧 raw Buffer，但 sharp/libvips 仍可能内部缓冲，不能将流式 API
宣称为无内存上限需要。浏览器备份的 4 MiB 限制由外层独立保持。

错误均为 ImageValidationError：

| code                 | 含义                                                                    |
|----------------------|-------------------------------------------------------------------------|
| INVALID_IMAGE        | 非支持 raster magic、容器不完整/损坏、帧或实际像素不匹配、解码失败      |
| IMAGE_LIMIT_EXCEEDED | 编码字节、帧数、全部帧像素或输出量超过本表限额                          |
| UNSUPPORTED_IMAGE    | APNG 全帧能力未验证；应保留原 bytes 并报告 unsupported                  |
| DECODER_UNAVAILABLE  | 打包的 sharp 缺失或不可加载；是执行能力阻断，不能把整个导入降为普通成功 |

本模块不访问网络、任意来源路径或 MIME 声明。保存 original bytes、available/unavailable/unsupported 业务报告由调用者负责。

验证：`node --test plugin-src/src/lib/image-validation/test/*.test.mjs`，包括实际 sharp 静态图、EXIF、多帧
GIF/WebP、完整容器内坏末帧、截断末帧、APNG、header-only、字节/帧/总像素限额与缺解码器。测试不证明 Electron 打包、Windows
或跨宿主行为。
