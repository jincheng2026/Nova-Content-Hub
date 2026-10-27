"""install.sh：部署成新版本、切换 current、建 Skill 链接；不覆盖别处的链接。只用 --no-service，不碰 launchd。"""
import os, subprocess, tempfile, time, unittest

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INSTALL = os.path.join(APP, 'install.sh')


class InstallTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='jc-install-')
        self.root = os.path.join(self.tmp, '安装 目录')  # 带空格和中文，和正式路径一样
        self.link = os.path.join(self.tmp, 'skills', 'jc-gongzuotai-write')
        self.brain = os.path.join(self.tmp, 'brain')
        os.makedirs(self.brain)

    def run_install(self):
        env = dict(os.environ, JC_INSTALL_ROOT=self.root, JC_SKILL_LINK=self.link, JC_BRAIN_ROOT=self.brain)
        return subprocess.run(['/bin/bash', INSTALL, '--no-service'], env=env, capture_output=True, text=True)

    def test_deploy_twice_keeps_old_version(self):
        r = self.run_install()
        self.assertEqual(r.returncode, 0, r.stderr)
        cur = os.path.join(self.root, 'current')
        first = os.readlink(cur)
        for f in ['SKILL.md', 'brain_page.py', 'build_page.py', 'creation_doc.py', 'VERSION.txt',
                  'server/brain_save.py', 'server/service.sh', 'template/app.js', 'template/style.css', 'kit/kit.js']:
            self.assertTrue(os.path.isfile(os.path.join(cur, f)), f)
        self.assertFalse(os.path.exists(os.path.join(cur, 'tests')), '测试不该部署')
        self.assertEqual(os.readlink(self.link), cur)
        time.sleep(1.1)  # 版本名精确到秒
        r = self.run_install()
        self.assertEqual(r.returncode, 0, r.stderr)
        second = os.readlink(cur)
        self.assertNotEqual(first, second)
        self.assertTrue(os.path.isdir(os.path.join(self.root, first)), '旧版本要留着')
        self.assertEqual(os.readlink(self.link), cur)

    def test_refuse_to_overwrite_foreign_skill_link(self):
        os.makedirs(os.path.dirname(self.link))
        os.symlink('/somewhere/else', self.link)
        r = self.run_install()
        self.assertNotEqual(r.returncode, 0)
        self.assertIn('已经指向别处', r.stderr)
        self.assertEqual(os.readlink(self.link), '/somewhere/else')


if __name__ == '__main__':
    unittest.main()
