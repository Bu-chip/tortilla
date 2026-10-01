import { build } from 'esbuild';
import { mkdir, mkdtemp, writeFile, rename, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);

export async function compilarWorker() {
  const resultado = await build({
    absWorkingDir: raiz, entryPoints: ['cloud/worker.js'], bundle: true,
    format: 'esm', platform: 'browser', target: 'es2022', keepNames: true,
    charset: 'utf8', legalComments: 'none', write: false,
  });
  return '// Generado desde cloud/worker.js. Copiar el archivo completo en Cloudflare.\n' + resultado.outputFiles[0].text;
}

export async function comprobarTipos(archivo) {
  const tipos = path.join(path.dirname(require.resolve('@cloudflare/workers-types/package.json')), 'index.d.ts');
  const config = path.join(path.dirname(archivo), 'tsconfig.json');
  await writeFile(config, JSON.stringify({
    compilerOptions: {
      allowJs: true, checkJs: true, noEmit: true, strict: false,
      target: 'es2022', module: 'esnext', moduleResolution: 'bundler',
      lib: ['es2022'], types: [], skipLibCheck: true,
    }, files: [archivo, tipos],
  }));
  const compilador = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin/tsc');
  try {
    execFileSync(process.execPath, [compilador, '--project', config, '--pretty', 'false'], { cwd: raiz, encoding: 'utf8' });
  } catch (error) {
    throw new Error(error.stdout || error.stderr || error.message);
  }
}

async function preparar() {
  const destino = path.join(raiz, 'dist/worker');
  await mkdir(destino, { recursive: true });
  const temporal = await mkdtemp(path.join(destino, '.comprobar-'));
  try {
    const archivo = path.join(temporal, 'worker.js');
    await writeFile(archivo, await compilarWorker());
    await comprobarTipos(archivo);
    await rename(archivo, path.join(destino, 'pegar-en-cloudflare.js'));
    console.log('Servidor preparado para el panel: cero errores de tipos con las definiciones de Cloudflare.');
  } finally {
    await rm(temporal, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await preparar();
