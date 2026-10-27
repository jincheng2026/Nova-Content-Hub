"""Release runtime regression: directory names ending .whl hold mandatory licenses."""
import hashlib,json,pathlib,subprocess,sys,tempfile,unittest
SCRIPT=pathlib.Path(__file__).resolve().parents[2]/'tools/lean-local-asr.py'
class LeanRuntimeTest(unittest.TestCase):
    def test_keeps_wheel_license_directories_and_copies_interpreter_aliases(self):
        with tempfile.TemporaryDirectory() as temp:
            root=pathlib.Path(temp);source=root/'source';source.mkdir();(source/'runtime.json').write_text(json.dumps({'version':1,'selfTest':'self-test/check.py'}));(source/'payload-manifest.json').write_text('{"files":[]}')
            license_file=source/'licenses'/'package-1.0.whl'/'package.dist-info'/'licenses'/'LICENSE';license_file.parent.mkdir(parents=True);license_file.write_text('Required third-party license')
            for name in ['tests/private-key-fixture.pem','__pycache__/module.pyc','install/package.whl','self-test/known.wav','preparation-test.json']:
                p=source/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('build-only')
            binary=source/'python/bin/python3.11';binary.parent.mkdir(parents=True);binary.write_bytes(b'portable interpreter');binary.chmod(0o755);(binary.parent/'python3').symlink_to('python3.11')
            output=root/'release';subprocess.run([sys.executable,str(SCRIPT),'--source',str(source),'--output',str(output)],check=True,capture_output=True)
            self.assertEqual((output/license_file.relative_to(source)).read_text(),'Required third-party license')
            self.assertFalse((output/'install/package.whl').exists());self.assertFalse((output/'tests').exists());self.assertFalse((output/'__pycache__').exists());self.assertFalse((output/'self-test').exists());self.assertFalse((output/'preparation-test.json').exists())
            alias=output/'python/bin/python3';self.assertFalse(alias.is_symlink());self.assertEqual(alias.read_bytes(),b'portable interpreter');self.assertTrue(alias.stat().st_mode & 0o111)
            self.assertNotIn('selfTest',json.loads((output/'runtime.json').read_text()))
            manifest=json.loads((output/'payload-manifest.json').read_text());entry=next(f for f in manifest['files'] if f['path']==license_file.relative_to(source).as_posix());self.assertEqual(entry['sha256'],hashlib.sha256(license_file.read_bytes()).hexdigest())
if __name__=='__main__':unittest.main()
