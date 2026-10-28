#!/usr/bin/env python3
"""把对照页的保存服务复制进内容包，并打印手动启动命令。不再登记第二大脑首页。
用法: python3 register_page.py <内容包目录> <对照页.html> <端口>
做两件事：1) 把 compare_server.py 复制到内容包里叫 对照页服务.py；
2) 打印手动启动命令，起好后在聊天里把 http://127.0.0.1:<端口>/ 给锦成。
端口从 8768 往后数，起之前用 lsof -nP -iTCP:<端口> -sTCP:LISTEN 看一眼有没有被占用。
"""
import os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))

def main():
    if len(sys.argv) != 4: sys.exit(__doc__)
    pkg, page, port = os.path.abspath(sys.argv[1]), sys.argv[2], int(sys.argv[3])
    page_abs = os.path.join(pkg, page)
    if not os.path.isfile(page_abs): sys.exit(f'找不到对照页：{page_abs}')
    shutil.copy(os.path.join(HERE, 'compare_server.py'), os.path.join(pkg, '对照页服务.py'))
    print(f'已复制保存服务：{os.path.join(pkg, "对照页服务.py")}')
    print(f'手动启动：python3 "{os.path.join(pkg, "对照页服务.py")}" --page "{page_abs}" --port {port}')
    print(f'起好后给锦成的链接：http://127.0.0.1:{port}/')

if __name__ == '__main__':
    main()
