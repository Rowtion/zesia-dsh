import {cp,mkdir,readFile,readdir,rm,utimes,writeFile} from 'node:fs/promises';
import{join}from'node:path';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
export async function copy(source,target,names){await mkdir(target,{recursive:true});for(const name of names)await cp(join(source,name),join(target,name),{recursive:true});}
async function files(root,prefix=''){const result=[];for(const row of await readdir(join(root,prefix),{withFileTypes:true})){if(row.isSymbolicLink())throw Error('Symlinks are not distributable.');const name=prefix+row.name;if(row.isDirectory())result.push(...await files(root,name+'/'));else result.push(name);}return result.sort();}
export async function pack(component, directory) {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const runtimeVersion = lock.packages['node_modules/@zesia/runtime'].version;
  const installedRuntime = JSON.parse(await readFile('node_modules/@zesia/runtime/package.json', 'utf8'));
  if (installedRuntime.version !== runtimeVersion) throw new Error('The installed Runtime does not match the lockfile.');

  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const repository = pkg.repository.url.replace(/\.git$/, '');
  const file = 'zesia-consult-' + component + '-' + pkg.version + '.zip';
  await mkdir('dist', { recursive: true });
  const archive = join(process.cwd(), 'dist', file);
  await rm(archive, { force: true });
  const names = await files(directory);
  const timestamp = new Date('2026-01-01T00:00:00Z');
  for (const name of names) await utimes(join(directory, name), timestamp, timestamp);
  execFileSync('zip', ['-Xq', archive, '-@'], { cwd: directory, input: names.join('\n') + '\n', env: { ...process.env, TZ: 'UTC' } });

  const bytes = await readFile(archive);
  const release = {
    format: 'zesia.plugin.release.v1',
    component,
    version: pkg.version,
    sourceSha,
    repository,
    runtimeVersion,
    file,
    url: repository + '/releases/download/v' + pkg.version + '/' + file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    administratorRequired: false,
  };
  await writeFile('dist/release.json', JSON.stringify(release, null, 2) + '\n');
  await writeFile(archive + '.sha256', release.sha256 + '  ' + file + '\n');
}
