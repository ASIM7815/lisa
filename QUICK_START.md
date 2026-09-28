# ⚡ LISA Quick Start Guide

Get LISA running in 5 minutes!

---

## Step 1: Install Dependencies (1 minute)

```bash
npm install
```

Wait for packages to download...

---

## Step 2: Set Up Environment (1 minute)

```bash
# Copy the example environment file
cp .env.example .env
```

Now open `.env` in your text editor and add your Groq API key:

```bash
GROQ_API_KEY=your_groq_key_here
GROQ_MODEL=openai/gpt-oss-120b
```

**Don't have a Groq API key?**
1. Go to https://console.groq.com/keys
2. Sign up (it's free)
3. Create an API key
4. Copy it to your `.env` file

---

## Step 3: Start the Server (30 seconds)

```bash
npm run dev
```

Wait for:
```
✓ Ready in 200ms
- Local:   http://localhost:3000
```

---

## Step 4: Open in Browser

Go to: **http://localhost:3000**

You'll see the LISA dashboard with demo data already loaded!

---

## Step 5: Try LISA (2 minutes)

### Try Case Analysis:
1. Click on any case (e.g., "CS-DEMO-009")
2. Click **"Analyze with LISA"**
3. See AI recommendation with evidence from past cases
4. Check the "Similar Cases" section

### Try LISA Chat:
1. Click **"Chat"** in the sidebar
2. Ask: **"What problems are customers having?"**
3. See clear, actionable answers
4. Try: **"What should I do about a late delivery?"**

### Create Your Own Case:
1. Click **"Create new case"** on dashboard
2. Fill in:
   - Title: "Customer received wrong item"
   - Description: "Ordered blue shirt, got red one"
   - Category: Customer complaint
   - Priority: High
3. Click **"Create"**
4. Click **"Analyze with LISA"** on the new case
5. See personalized recommendation

### Complete the Learning Loop:
1. Click **"Approve"** on LISA's recommendation
2. Click **"Resolve Case"**
3. Select outcome: "Success"
4. Add note: "Customer happy with replacement"
5. Click **"Resolve"**
6. ✅ LISA has now learned from this case!

---

## ✅ You're Done!

LISA is now running with:
- ✅ Real AI intelligence (Groq API)
- ✅ Case management
- ✅ Smart recommendations
- ✅ Learning from outcomes
- ✅ Intelligent chat

---

## 🎯 Next Steps

### Explore More:
- **Dashboard** - See metrics and trends
- **Memory** - View what LISA has learned
- **Analytics** - See patterns across cases
- **Settings** - Configure LISA's behavior

### Customize:
- Add your own demo data
- Try different case types
- Experiment with decision outcomes
- Watch LISA's confidence improve

### Deploy (Optional):
- Set up PostgreSQL for permanent storage
- Add Redis for better performance
- Deploy to Vercel for production

---

## 🆘 Troubleshooting

### LISA shows "local mode"?
Add your `GROQ_API_KEY` to `.env` and restart the server.

### No cases showing?
The app should auto-seed demo data. Try refreshing the page.

### API errors?
Check your Groq API key is valid:
```bash
curl http://localhost:3000/api/health
```

Look for `"llm": "groq"` in the response.

### Server won't start?
Make sure you have Node.js 20.11+ installed:
```bash
node --version
```

---

## 📖 Learn More

- **README.md** - Full documentation
- **AI_INTEGRATION_COMPLETE.md** - AI setup details
- **IMPROVED_RESPONSES.md** - Response style guide

---

## 💡 Quick Tips

1. **Ask LISA questions** - Try "What patterns do you see?"
2. **Resolve cases** - LISA learns from outcomes
3. **Check similar cases** - See what worked before
4. **Use the chat** - Get instant advice
5. **Track decisions** - Full audit trail included

---

**Enjoy using LISA! 🎉**
