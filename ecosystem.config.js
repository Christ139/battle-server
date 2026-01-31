module.exports = {
  apps: [{
    name: 'battle-server',
    script: 'Server.js',
    env: {
      NODE_ENV: 'production',
      DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1467252833865961658/VfeqTNYmLfFSvuBpua_9BCgTu0Q3wpo9cSsS8-NE3jckfffpoykmxY7MRjDdhdxKbrDS'
    }
  }]
};
