# Telegram Signal Notifications Setup Guide

This guide will help you set up Telegram notifications for trading signals from the Mariposa Scalping Bot.

## Overview

The bot automatically sends trading signal notifications to your Telegram group whenever:
- High-priority signals are detected (priority ≥ 70)
- Signals are validated by 2 or more agents
- Whale activity is detected
- High-confidence opportunities are found

## Prerequisites

- A Telegram account
- Admin access to create bots via BotFather
- Ability to create and manage Telegram groups

## Step 1: Create a Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Start a chat with BotFather
3. Send the command: `/newbot`
4. Follow the prompts:
   - **Bot Name**: Choose a display name (e.g., "Mariposa Scalping Alerts")
   - **Bot Username**: Choose a unique username ending in 'bot' (e.g., "mariposa_scalping_bot")
5. **Save the API Token** provided by BotFather (format: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

Example interaction:
```
You: /newbot
BotFather: Alright, a new bot. How are we going to call it?

You: Mariposa Scalping Alerts
BotFather: Good. Now let's choose a username for your bot.

You: mariposa_scalping_bot
BotFather: Done! Congratulations on your new bot. You will find it at t.me/mariposa_scalping_bot.
Use this token to access the HTTP API:
1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

## Step 2: Create a Telegram Group

1. In Telegram, create a new group:
   - Tap the menu icon → "New Group"
   - Name your group (e.g., "Trading Signals")
   - Add your bot to the group (search for the bot username you created)

2. **Make the bot an administrator**:
   - Go to Group Info → Administrators
   - Tap "Add Administrator"
   - Select your bot
   - Grant permissions (at minimum: "Send Messages")

⚠️ **Important**: The bot MUST be an administrator to send messages to the group.

## Step 3: Get the Chat ID

### Method A: Using getUpdates API

1. Send any message in your group (e.g., "Hello bot")
2. Open this URL in your browser (replace `<YOUR_BOT_TOKEN>` with your actual token):
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```

3. Look for the `chat` object in the response:
   ```json
   {
     "ok": true,
     "result": [{
       "update_id": 123456789,
       "message": {
         "chat": {
           "id": -1001234567890,
           "title": "Trading Signals",
           "type": "group"
         }
       }
     }]
   }
   ```

4. **Save the Chat ID** (the negative number, e.g., `-1001234567890`)

### Method B: Using the Backend API (After Setup)

1. Complete the environment variable setup (Step 4)
2. Make a POST request to: `/api/telegram/test`
3. The chat ID will be logged in the console

## Step 4: Configure Environment Variables

Add these variables to your `.env` file:

```bash
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=-1001234567890
TELEGRAM_ENABLED=true
```

**Configuration Options:**
- `TELEGRAM_BOT_TOKEN`: Your bot token from BotFather (required)
- `TELEGRAM_CHAT_ID`: Your group chat ID (required, starts with `-`)
- `TELEGRAM_ENABLED`: Set to `true` to enable notifications, `false` to disable

## Step 5: Restart the Application

```bash
npm run build
pm2 restart npm
```

Or for development:
```bash
npm run dev
```

## Step 6: Test the Integration

### Option 1: Using the API

Make a POST request to test the connection:

```bash
curl -X POST http://localhost:3001/api/telegram/test \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "message": "Test message sent successfully to Telegram group!"
}
```

### Option 2: Using the Frontend (if available)

Navigate to: `Dashboard → Settings → Telegram`

Click the "Test Connection" button.

### Option 3: Send a Test Signal

```bash
curl -X POST http://localhost:3001/api/telegram/test-signal \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

You should receive a formatted trading signal in your Telegram group.

## Signal Message Format

Signals will appear in your Telegram group like this:

```
🔔 NEW TRADING SIGNAL

📊 Symbol: `BTC/USDT`
📈 Action: *BUY*
💪 Confidence: 87.0% ██████████░
🎯 Target: $45,230
🛡️ Stop Loss: $44,100
🏷️ Category: WHALE_ACTIVITY
⚡ Priority: 🔥 CRITICAL (95/100)

💡 Reasoning:
_Strong momentum detected with whale accumulation..._

📈 Agent Validation:
✅ Validated: 4/5 (80%)
❌ Rejected: 1

⏰ Time: 1/15/25, 2:23 PM UTC

_🤖 Automated Signal by Mariposa Scalping Bot_
```

## Notification Rules

### Signals that are sent:
- ✅ High priority (≥70)
- ✅ Validated by 2+ agents
- ✅ Whale activity (HIGH impact)
- ✅ Opportunities with >75% confidence

### Signals that are skipped:
- ❌ Low priority (<70)
- ❌ Validated by <2 agents
- ❌ Low confidence (<50%)

## Troubleshooting

### "Bot not initialized" Error

**Problem**: `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` is missing or invalid.

**Solution**:
1. Check your `.env` file has the correct values
2. Ensure no extra spaces in the token/chat ID
3. Verify `TELEGRAM_ENABLED=true`
4. Restart the application

### "Forbidden: bot was kicked from the group"

**Problem**: Bot was removed from the group.

**Solution**:
1. Add the bot back to the group
2. Make it an administrator again
3. Send a test message to verify

### "Forbidden: bot is not a member of the group"

**Problem**: Chat ID is incorrect or bot isn't in the group.

**Solution**:
1. Verify the bot is in the group
2. Double-check the Chat ID (should be negative)
3. Use the `/getUpdates` method to find the correct ID

### "Bad Request: chat not found"

**Problem**: Invalid Chat ID format.

**Solution**:
1. Ensure Chat ID starts with `-` (e.g., `-1001234567890`)
2. Group IDs are negative, channel IDs start with `-100`
3. Personal chat IDs are positive

### Messages not appearing

**Problem**: Bot isn't an administrator or has insufficient permissions.

**Solution**:
1. Go to Group Info → Administrators
2. Ensure your bot is listed
3. Grant "Send Messages" permission
4. Check "Post Messages" if it's a channel

## Rate Limiting

The bot implements automatic rate limiting:
- **Maximum**: 20 messages per minute
- **Delay**: 3 seconds between messages
- **Queue**: High-priority signals sent first

If you have many active agents generating signals, messages will be queued and sent sequentially to avoid Telegram API limits.

## Security Considerations

- ✅ Bot token stored in environment variables (never committed to git)
- ✅ Requires authentication to test endpoints
- ✅ No sensitive trading data (API keys, passwords) in messages
- ✅ Chat ID can be changed without code modifications
- ⚠️ Consider using private groups (not public channels) for sensitive signals
- ⚠️ Limit group membership to trusted users only

## Advanced Configuration

### Per-User Telegram Groups (Future Enhancement)

Currently, all signals go to one global group. To support per-user groups:

1. Update user settings via API (not yet implemented):
   ```bash
   PUT /api/user/telegram-settings
   {
     "telegramChatId": "-1001234567890",
     "telegramNotificationsEnabled": true
   }
   ```

2. The system will send signals to each user's configured group.

### Custom Notification Filters (Future Enhancement)

Filter which signals to receive:
- By symbol (e.g., only BTC/USDT)
- By confidence threshold (e.g., >80%)
- By category (e.g., only WHALE_ACTIVITY)
- By specific agents

## API Endpoints

### Test Connection
```
POST /api/telegram/test
Authorization: Bearer <JWT_TOKEN>
```

Response:
```json
{
  "success": true,
  "message": "Test message sent successfully to Telegram group!"
}
```

### Get Status
```
GET /api/telegram/status
Authorization: Bearer <JWT_TOKEN>
```

Response:
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "connected": true,
    "chatId": "-1001234567890",
    "queueSize": 3
  }
}
```

### Send Test Signal
```
POST /api/telegram/test-signal
Authorization: Bearer <JWT_TOKEN>
```

Sends a sample trading signal to test formatting.

## Logs

Monitor Telegram activity in the application logs:

```bash
# View logs
pm2 logs npm

# Search for Telegram messages
pm2 logs npm | grep "📱"

# Check for errors
pm2 logs npm | grep "Telegram"
```

Example log output:
```
✅ Telegram bot initialized successfully
📱 Will send notifications to chat: -1001234567890
📱 Queued Telegram notification for BTC/USDT (priority: 95)
✅ Telegram message sent successfully
```

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Verify your `.env` configuration
3. Test using `/api/telegram/test` endpoint
4. Check application logs for error messages
5. Ensure your bot has proper permissions in the group

## References

- [Telegram Bot API Documentation](https://core.telegram.org/bots/api)
- [BotFather Commands](https://core.telegram.org/bots#botfather)
- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api)
