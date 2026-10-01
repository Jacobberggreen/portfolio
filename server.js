const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 8080;
const rootDir = __dirname;

const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.pdf': 'application/pdf'
};

const serveFile = (filePath, res) => {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500);
            res.end('Serverfel');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(data);
    });
};

const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    const targetPath = path.join(rootDir, safePath === '/' ? '/index.html' : safePath);

    fs.stat(targetPath, (err, stats) => {
        if (!err && stats.isFile()) {
            serveFile(targetPath, res);
            return;
        }

        // Fallback för kataloger -> index.html
        if (!err && stats.isDirectory()) {
            const indexPath = path.join(targetPath, 'index.html');
            fs.stat(indexPath, (idxErr, idxStats) => {
                if (!idxErr && idxStats.isFile()) {
                    serveFile(indexPath, res);
                    return;
                }
                res.writeHead(404);
                res.end('404 - Hittar inte filen');
            });
            return;
        }

        res.writeHead(404);
        res.end('404 - Hittar inte filen');
    });
});

server.listen(port, () => {
    console.log(`Servern är igång på http://localhost:${port}`);
});
