const { execSync } = require('child_process');

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

function getGitInfo() {
  try {
    const commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const commitMessage = execSync('git log -1 --pretty=%s', { encoding: 'utf8' }).trim();
    const author = execSync('git log -1 --pretty=%an', { encoding: 'utf8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    return { commitHash, commitMessage, author, branch };
  } catch (err) {
    return { commitHash: 'unknown', commitMessage: 'unknown', author: 'unknown', branch: 'unknown' };
  }
}

async function sendCrashNotification(error, type) {
  if (!WEBHOOK_URL) return;

  const git = getGitInfo();

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: '💥 Battle Server Crashed',
          color: 15158332,
          fields: [
            { name: '❌ Type', value: type, inline: true },
            { name: '📦 Commit', value: `\`${git.commitHash}\``, inline: true },
            { name: '💬 Error', value: '```' + (error.message || 'Unknown').substring(0, 200) + '```', inline: false }
          ],
          footer: { text: 'Restarting...' },
          timestamp: new Date().toISOString()
        }]
      })
    });
  } catch (err) {
    console.error('Failed to send crash notification:', err);
  } finally {
    process.exit(1);
  }
}

async function notifyDiscordStartup(serverInfo = {}) {
  if (!WEBHOOK_URL) return;

  const memoryUsage = process.memoryUsage();
  const memoryUsedMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
  const git = getGitInfo();

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: '🟢 Battle Server Online',
          color: 3066993,
          fields: [
            { name: '📦 Commit', value: `\`${git.commitHash}\` on \`${git.branch}\``, inline: true },
            { name: '👤 Author', value: git.author, inline: true },
            { name: '🔌 Port', value: `${serverInfo.port || 4100}`, inline: true },
            { name: '💬 Message', value: git.commitMessage.substring(0, 80), inline: false }
          ],
          footer: { text: `${process.env.NODE_ENV || 'development'} • ${memoryUsedMB} MB` },
          timestamp: new Date().toISOString()
        }]
      })
    });
    console.log('Discord notification sent');
  } catch (error) {
    console.error('Failed to send Discord notification:', error);
  }
}

function setupCrashHandlers() {
  if (!WEBHOOK_URL) {
    console.log('No DISCORD_WEBHOOK_URL set, crash notifications disabled');
    return;
  }

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    sendCrashNotification(error, 'Uncaught Exception');
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
    const error = reason instanceof Error ? reason : new Error(String(reason));
    sendCrashNotification(error, 'Unhandled Rejection');
  });
}

async function notifyDiscordShutdown(serverInfo = {}) {
  if (!WEBHOOK_URL) return;

  const git = getGitInfo();
  const uptimeSeconds = process.uptime();
  const uptimeFormatted = uptimeSeconds > 3600
    ? `${(uptimeSeconds / 3600).toFixed(1)} hours`
    : `${(uptimeSeconds / 60).toFixed(1)} minutes`;

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: '🔴 Battle Server Offline',
          color: 16776960,
          fields: [
            { name: '⚔️ Active Battles', value: `${serverInfo.activeBattles || 0}`, inline: true },
            { name: '⏱️ Uptime', value: uptimeFormatted, inline: true },
            { name: '📦 Commit', value: `\`${git.commitHash}\``, inline: true }
          ],
          footer: { text: 'Graceful shutdown' },
          timestamp: new Date().toISOString()
        }]
      })
    });
    console.log('Discord shutdown notification sent');
  } catch (error) {
    console.error('Failed to send Discord notification:', error);
  }
}

module.exports = {
  notifyDiscordStartup,
  notifyDiscordShutdown,
  setupCrashHandlers
};
