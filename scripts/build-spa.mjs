import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const pages = ['index','inventory','reports','setting','add-entry',
 'pending-amount','missing-lot','missing-completion','quality-history','performance'];
const shared = new Set(['bootstrap.js','server-client.js','theme-boot.js','icons.js','pwa.js',
 'db.js','store.js','calc.js','archive.js','report-engine.js']);
const scripts = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const assetName = url => url.split('?')[0].replace(/^\//, '');

export function buildSpa(out, root, tag) {
 for (const page of pages) {
  const filename = path.join(out,page+'.html');
  let html = fs.readFileSync(filename,'utf8');
  const sources = [], bindings = new Set();
  html = html.replace(scripts,(all, attributes, inline) => {
   const src = /\bsrc=["']([^"']+)["']/.exec(attributes)?.[1];
   if(src && /^(?:db|store|calc|archive|report-engine)\.js$/.test(assetName(src)))return '';
   if (inline.trim()==='/*ALISHAN_SESSION*/'||(src && shared.has(assetName(src)))) return all;
   const code = src ? fs.readFileSync(path.join(out,assetName(src)),'utf8') : inline;
   if (!code.trim() || attributes.includes('application/')) return all;
   const ast = parse(code,{sourceType:'script'});
   for (const node of ast.program.body) {
    if ((node.type==='FunctionDeclaration'||node.type==='ClassDeclaration') && node.id) bindings.add(node.id.name);
    if (node.type==='VariableDeclaration') for (const declaration of node.declarations) {
     if (declaration.id.type==='Identifier') bindings.add(declaration.id.name);
    }
   }
   sources.push(code);
   return '';
  });
  html = html.replace(/<(?:style\b|link\b(?=[^>]*\brel=["']stylesheet["']))/gi, match=>match+' data-alishan-page-style');
  const script = `window.AlishanRouter.register(${JSON.stringify(page)}, function(__alishanRouteContext) {
const {window,document,AlishanStore,setTimeout,clearTimeout,setInterval,clearInterval,addEventListener,removeEventListener} = __alishanRouteContext;
${sources.join('\n;\n')}
__alishanRouteContext.expose({${[...bindings].join(',')}});
});\n`;
  parse(script,{sourceType:'script'});
  fs.writeFileSync(path.join(out,`route-${page}.js`),script);
  html = html.replace('</body>',
   `<script src="/spa.js?v=${tag}"></script><script src="/route-${page}.js?v=${tag}"></script></body>`);
  fs.writeFileSync(filename,html);
 }
 fs.writeFileSync(path.join(out,'spa.js'),fs.readFileSync(path.join(root,'client/spa.js'),'utf8').replace('__ASSET_TAG__',tag));
}
