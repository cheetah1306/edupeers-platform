const { execSync, spawn } = require('child_process');

try {
    const netstat = execSync('netstat -ano').toString();
    const lines = netstat.split('\n').filter(l => l.includes(':4000') && l.includes('LISTENING'));
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && pid !== String(process.pid)) {
            try { 
                console.log(`Killing old port 4000 process: ${pid}`);
                execSync(`taskkill /F /PID ${pid}`); 
            } catch (e) {}
        }
    }
} catch (e) {}

console.log('Spawning new server.js instance...');
const child = spawn('node', ['server.js'], { 
    cwd: __dirname,
    detached: true, 
    stdio: 'inherit' 
});
child.unref();
console.log('Server spawned successfully.');
