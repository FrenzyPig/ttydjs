const os = require('os');
const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const axios = require('axios');
const httpProxy = require('http-proxy');
const { promisify } = require('util');
const stream = require('stream');
const { exec, execSync } = require('child_process');
const pipeline = promisify(stream.pipeline);

// 创建代理服务器
const proxy = httpProxy.createProxyServer({});
ensureModule('ws');
const { WebSocket, createWebSocketStream } = require('ws');

const UUID = process.env.UUID || 'a2c803ad-84dd-4ad7-9580-be9be3f7e1af';
const PORT = process.env.PORT || 10000;
const DOMAIN = process.env.DOMAIN || 'node.js';
const TTYD = process.env.TTYD || 'TRUE';
const FILE_PATH = process.env.FILE_PATH || './app';
const NAME = process.env.NAME || os.hostname();
const Path_TTYD = path.join(FILE_PATH, 'ttyd');

function ensureModule(name) {
    try {
        require.resolve(name);
    } catch (e) {
        console.log(`Module '${name}' not found. Installing...`);
        execSync(`npm install ${name}`, { stdio: 'inherit' });
    }
}

async function setExecutablePermission(filePath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath)) return reject(new Error(`文件不存在: ${filePath}`));
        fs.chmod(filePath, 0o755, (err) => {
            if (err) return reject(err);
            console.log(`权限设置成功 [${filePath}]: 755`);
            resolve();
        });
    });
}

async function downloadFile(url, savePath, overwrite = 0) {
    try {
        let fullPath;
        if (fs.existsSync(savePath) && fs.statSync(savePath).isDirectory()) {
            const fileName = url.split('/').pop() || `download_${Date.now()}`;
            fullPath = path.join(savePath, fileName);
        } else {
            fullPath = savePath;
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        }

        if (fs.existsSync(fullPath) && overwrite === 0) {
            console.log(`File already exists (skip download): ${fullPath}`);
            return fullPath;
        }

        console.log(`Downloading ${url} to ${fullPath}...`);
        const response = await axios({ method: 'get', url, responseType: 'stream' });
        await pipeline(response.data, fs.createWriteStream(fullPath));
        console.log(`Download completed: ${fullPath}`);
        return fullPath;
    } catch (err) {
        console.error(`Download failed: ${err.message}`);
        throw new Error(`下载失败: ${err.message}`);
    }
}

async function runBackgroundService(command, serviceName, delay = 1000) {
    if (!command.includes('nohup') || !command.trim().endsWith('&')) {
        throw new Error('命令必须以 nohup 开头并以 & 结尾');
    }

    try {
        const child = exec(command, { detached: true, stdio: 'ignore' });
        child.unref();
        console.log(`${serviceName} 启动中...`);
        await new Promise(r => setTimeout(r, delay));
        console.log(`${serviceName} 已运行`);
    } catch (err) {
        console.error(`${serviceName} 启动失败: ${err.message}`);
        throw err;
    }
}

const httpServer = http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello, World\n');
    } else if (req.url === `/${UUID}`) {
        const vlessURL = `vless://${UUID}@${DOMAIN}:443?encryption=none&security=tls&sni=${DOMAIN}&fp=chrome&type=ws&host=${DOMAIN}&path=%2F#Vl-ws-tls-${NAME}`;
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(vlessURL + '\n');
    } else if (req.url.startsWith('/ttyd')) {
        proxy.web(req, res, { target: 'http://localhost:3000' });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found\n');
    }
});

// WebSocket Server（VLESS 使用）
const wss = new WebSocket.Server({ noServer: true });

// Upgrade 路由：根据路径区分 VLESS 和 ttyd
httpServer.on('upgrade', (req, socket, head) => {
    const { url } = req;

    if (url === '/') {
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    } else if (url.startsWith('/ttyd')) {
        proxy.ws(req, socket, head, { target: 'http://localhost:3000' });
    } else {
        socket.destroy();
    }
});

// VLESS 连接处理
wss.on('connection', ws => {
    ws.once('message', msg => {
        const uuid = UUID.replace(/-/g, "");
        const [VERSION] = msg;
        const id = msg.slice(1, 17);
        if (!id.every((v, i) => v == parseInt(uuid.substr(i * 2, 2), 16))) return;

        let i = msg.slice(17, 18).readUInt8() + 19;
        const port = msg.slice(i, i += 2).readUInt16BE(0);
        const ATYP = msg.slice(i, i += 1).readUInt8();
        const host =
            ATYP === 1
                ? msg.slice(i, i += 4).join('.')
                : ATYP === 2
                    ? new TextDecoder().decode(msg.slice(i + 1, i += 1 + msg.slice(i, i + 1).readUInt8()))
                    : ATYP === 3
                        ? msg.slice(i, i += 16).reduce((s, b, j, a) =>
                            j % 2 ? s.concat(a.slice(j - 1, j + 1)) : s, []
                        ).map(b => b.readUInt16BE(0).toString(16)).join(':')
                        : '';

        ws.send(new Uint8Array([VERSION, 0]));
        const duplex = createWebSocketStream(ws);
        net.connect({ host, port }, function () {
            this.write(msg.slice(i));
            duplex.on('error', () => {}).pipe(this).on('error', () => {}).pipe(duplex);
        }).on('error', () => {});
    }).on('error', () => {});
});

async function main() {
    console.log('你的UUID:', UUID);
    console.log('你的端口:', PORT);
    console.log('你的域名:', DOMAIN);
    console.log('你的NAME:', NAME);
    console.log('Path_TTYD:', Path_TTYD);

    if (TTYD === 'TRUE') {
        await downloadFile('https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64', Path_TTYD);
        await setExecutablePermission(Path_TTYD);
        const command = `nohup ${Path_TTYD} -p 3000 -c root:${UUID} -b /ttyd -W bash >/tmp/ttyd.log 2>&1 &`;
        await runBackgroundService(command, 'ttyd');
    }

    httpServer.listen(PORT, () => {
        console.log(`HTTP Server is running on port ${PORT}`);
        console.log(`vless-ws-tls节点分享: vless://${UUID}@${DOMAIN}:443?encryption=none&security=tls&sni=${DOMAIN}&fp=chrome&type=ws&host=${DOMAIN}&path=%2F#Vl-ws-tls-${NAME}`);
    });
}

main();

