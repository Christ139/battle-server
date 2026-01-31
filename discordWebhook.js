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

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '**BATTLE SERVER CRASH**',
        embeds: [{
          title: `${type} Error`,
          description: 'Battle server crashed and is restarting',
          color: 15158332,
          fields: [
            {
              name: 'Error Message',
              value: '```' + (error.message || 'Unknown error').substring(0, 1000) + '```'
            },
            {
              name: 'Timestamp',
              value: new Date().toLocaleString(),
              inline: true
            }
          ],
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

  const fields = [
    { name: 'Environment', value: process.env.NODE_ENV || 'development', inline: true },
    { name: 'Port', value: `${serverInfo.port || 4100}`, inline: true },
    { name: 'Memory', value: `${memoryUsedMB} MB`, inline: true },
    { name: 'Branch', value: git.branch, inline: true },
    { name: 'Commit', value: git.commitHash, inline: true },
    { name: 'Author', value: git.author, inline: true },
    { name: 'Commit Message', value: git.commitMessage.substring(0, 100), inline: false }
  ];

  if (serverInfo.activeBattles !== undefined) {
    fields.push({ name: 'Active Battles', value: `${serverInfo.activeBattles}`, inline: true });
  }

  fields.push({
    name: 'Server Time',
    value: new Date().toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      dateStyle: 'short',
      timeStyle: 'medium'
    }),
    inline: false
  });

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '**Battle Server Online**',
        embeds: [{
          title: 'Battle Server Started',
          description: 'Battle server is now running',
          color: 3066993,
          fields: fields,
          footer: { text: 'Battle Server' },
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

module.exports = {
  notifyDiscordStartup,
  setupCrashHandlers
};
