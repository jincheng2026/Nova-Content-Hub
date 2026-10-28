# Media codec component notices and source references

This component includes Python 3.11.16 from python-build-standalone and PyAV 18.1.0. Their original notices, authors and upstream metadata are retained in the adjacent `python/` and `av/` license directories and the PyAV `dist-info` directory. The PyAV BSD license alone does not describe all the bundled native dependencies.

The unchanged bundled `libavcodec.62.28.102.dylib` reports `FFmpeg version 8.1.2` and `libavcodec license: LGPL version 3 or later`. Its embedded configure string enables `--enable-version3`, `--enable-libx264` and `--enable-libx265`; its actual Mach-O dependencies include the x264 and x265 libraries. Those observed facts are recorded in `provenance.json`. The FFmpeg 8.1.2 upstream license document identifies x264 and x265 as GPL libraries. This component therefore retains original GPL and LGPL texts as well as the individual library notices. It does not claim that all bundled code is BSD or that an automatic legal review has been completed.

The `sources.json` file records each downloaded original notice's URL, byte size and SHA256. No new executable, model, library or build script was downloaded. Versioned notice references were used where available. The x264, x265, LAME and OpenCORE notice URLs use upstream master; their exact notice bytes are pinned by SHA256, but that does not establish a corresponding source revision for the binary. This remains an explicit release review item.

Sources and project references for the bundled components:

- Python: https://github.com/python/cpython/tree/v3.11.16 ; build provenance and archive hashes are in `python/python-source.json`.
- PyAV 18.1.0: https://github.com/PyAV-Org/PyAV/tree/v18.1.0 ; vendor release reference: https://github.com/PyAV-Org/PyAV/blob/v18.1.0/scripts/ffmpeg-latest.json
- FFmpeg 8.1.2: https://github.com/FFmpeg/FFmpeg/tree/n8.1.2 ; source archive: https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz
- x264 (ABI 165): https://code.videolan.org/videolan/x264
- x265 (ABI 216; binary string `4.2+1-e444744`): https://bitbucket.org/multicoreware/x265_git/src/master/ ; official mirror: https://github.com/videolan/x265
- SVT-AV1 4.1.0: https://gitlab.com/AOMediaCodec/SVT-AV1/-/tree/v4.1.0
- dav1d 1.5.3: https://code.videolan.org/videolan/dav1d/-/tree/1.5.3
- libvpx 1.16.0: https://github.com/webmproject/libvpx/tree/v1.16.0
- libwebp 1.6.0 (includes sharpyuv and webpmux): https://github.com/webmproject/libwebp/tree/v1.6.0
- Opus: https://github.com/xiph/opus ; retained notice reference v1.6.1
- LAME: https://lame.sourceforge.io/ ; source mirror: https://github.com/rbrito/lame
- OpenCORE AMR-NB/AMR-WB: https://sourceforge.net/projects/opencore-amr/ ; source mirror: https://github.com/BelledonneCommunications/opencore-amr

Complete corresponding sources, source offers, build configuration correspondence and the final distributor's obligations require release review; these URLs and notices alone are not represented as satisfying every redistribution obligation. The binaries were copied unchanged from the locally verified source payload. No native binaries were rebuilt or patched by this preparation step.
