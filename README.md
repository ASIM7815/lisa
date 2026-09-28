# LISA — Learning Intelligence & Strategy Agent

**An AI-powered business operations assistant that learns from your decisions and gets smarter over time.**

LISA helps you handle customer issues by analyzing past experiences and recommending the best action. It remembers what worked (and what didn't) so future decisions are faster and more accurate.

---

## 🎯 What LISA Does

**LISA analyzes customer issues and recommends solutions based on real past outcomes.**

Here's how it works:

1. **You create a case** (delivery problem, refund request, complaint, etc.)
2. **LISA analyzes it** - searches past similar cases and recommends an action
3. **You decide** - approve, modify, or reject the recommendation
4. **You resolve the case** - record what actually happened (success/failure)
5. **LISA learns** - remembers the outcome and uses it for future cases

> **You stay in control.** LISA only recommends actions. It never automatically refunds money, contacts customers, or executes any business actions. You always make the final decision.

---

## ✨ Key Features

- **Smart Case Analysis** - LISA finds similar past cases and shows what worked before
- **Evidence-Based Recommendations** - Every suggestion comes with reasons and past results
- **Learning Memory** - Remembers outcomes and improves recommendations over time
- **LISA Chat** - Ask questions about patterns, problems, or what to do
- **Dashboard** - See case volume, success rates, and what LISA has learned
- **Decision Tracking** - Full audit trail of every decision and outcome

---

## 🚀 Quick Start (5 Minutes)

### Requirements
- Node.js 20.11 or higher
- npm 10 or higher

### Install & Run

```bash
# 1. Install dependencies
npm install

# 2. Set up environment (copy example file)
cp .env.example .env

# 3. Add your Groq API key to .env
# Open .env and add: GROQ_API_KEY=your_key_here

# 4. Start the app
npm run dev
```

**Open http://localhost:3000** in your browser.

The app includes demo data so you can try it immediately!

---

## 🔑 Get Your API Keys (Optional but Recommended)

### Groq API (For AI Intelligence)

1. Go to https://console.groq.com/keys
2. Create a free account
3. Generate an API key
4. Add to `.env`: `GROQ_API_KEY=your_key_here`

**Recommended model:** `openai/gpt-oss-120b` (already configured)

Without Groq, LISA uses basic rules - it works but isn't as smart.

### Other Optional Services

- **PostgreSQL** - For permanent storage (required for production)
- **Redis** - For caching (improves performance)
- **Hindsight** - For advanced memory features (optional)

**For local development, you don't need these.** LISA stores data in a local file and works fine for testing.

---

## 📖 How to Use LISA

### 1. Dashboard
See all your cases, success rates, and what LISA has learned.

### 2. Create a Case
Click "Create Case" and fill in:
- Customer issue (delivery problem, refund, complaint, etc.)
- Customer details
- Priority level

### 3. Analyze with LISA
Click "Analyze with LISA" on any case. LISA will:
- Search for similar past cases
- Show what actions worked before
- Recommend the best action
- Explain why with evidence

### 4. Make Your Decision
- **Approve** - Use LISA's recommendation
- **Modify** - Change the recommendation
- **Reject** - Choose a different action

### 5. Resolve the Case
After taking action, record what happened:
- **Success** - It worked, customer happy
- **Partial** - Partially resolved
- **Failure** - Didn't work as expected

LISA remembers this and uses it for future similar cases!

### 6. Chat with LISA
Ask questions like:
- "What problems are customers having?"
- "What should I do about a late delivery?"
- "What patterns do you see?"
- "Have we dealt with this before?"

---

## 💾 What Gets Stored

### Local File Storage (Development)
- Data stored in `.lisa/data.json`
- Fine for testing and demos
- Not suitable for production

### PostgreSQL (Production)
- All cases, decisions, outcomes, and lessons
- Permanent and reliable
- Required for production use

### Memory System
- Every resolved case becomes a "memory"
- LISA recalls these when analyzing new cases
- Shows which past actions succeeded or failed

---

## 🛠️ Tech Stack

**Frontend:**
- Next.js 16 with App Router
- React 19
- TypeScript
- Tailwind CSS 4

**Backend:**
- Next.js API Routes (same server)
- Groq AI API (openai/gpt-oss-120b model)
- PostgreSQL (optional - for production)
- Redis (optional - for caching)

**AI & Memory:**
- Groq LLM for intelligent analysis
- Built-in memory system (or Hindsight for advanced use)

---

## 📁 Project Structure

```
lisa/
├── src/
│   ├── app/              # Pages and UI
│   │   ├── page.tsx      # Dashboard
│   │   ├── cases/        # Case list and detail pages
│   │   ├── chat/         # LISA chat
│   │   └── api/          # Backend API routes
│   ├── components/       # Reusable UI components
│   ├── lib/
│   │   ├── services/     # Business logic
│   │   ├── llm/          # Groq AI integration
│   │   ├── memory/       # Memory and learning
│   │   └── db/           # Database access
├── .env                  # Your API keys (not committed)
├── .env.example          # Template for environment setup
└── package.json          # Dependencies
```

---

## ⚙️ Environment Configuration

Edit `.env` to configure LISA:

```bash
# AI Intelligence (Required for smart recommendations)
GROQ_API_KEY=your_groq_key_here
GROQ_MODEL=openai/gpt-oss-120b

# Database (Optional - uses local file if not set)
DATABASE_URL=postgresql://user:pass@host:5432/lisa

# Cache (Optional - improves performance)
REDIS_URL=redis://localhost:6379

# Security (Optional - for production)
LISA_API_TOKEN=your_secure_token_here
```

---

## 🔒 Security Notes

✅ **API keys are server-side only** - never exposed to the browser  
✅ **No keys in client code** - all AI calls happen on the server  
✅ **`.env` is gitignored** - your keys stay private  
✅ **Use `LISA_API_TOKEN`** in production to protect your API  

**If you accidentally expose a key:** Revoke it immediately at the provider and generate a new one.

---

## 🚢 Deploying to Production

### Minimum Requirements:
1. ✅ PostgreSQL database
2. ✅ `LISA_API_TOKEN` set
3. ✅ `GROQ_API_KEY` set
4. ✅ Run `npm run db:migrate` before first deploy

### Deploy to Vercel (Easiest):

1. Push your code to GitHub
2. Go to https://vercel.com
3. Import your repository
4. Add environment variables:
   - `GROQ_API_KEY`
   - `DATABASE_URL` (use Vercel Postgres)
   - `REDIS_URL` (use Vercel KV)
   - `LISA_API_TOKEN`
5. Deploy!

**Vercel handles SSL, scaling, and serverless functions automatically.**

---

## 🧪 Testing & Development

```bash
# Run development server
npm run dev

# Check types
npm run typecheck

# Lint code
npm run lint

# Run tests
npm test

# Build for production
npm run build

# Run all checks
npm run check
```

---

## 📊 Example Use Cases

### Customer Support
- Delivery failures
- Refund requests
- Product complaints
- Order issues

### Operations
- Escalations
- Supplier problems
- Service incidents

### Learning Patterns
- "What actions work best for late deliveries?"
- "Which refund approaches have highest success?"
- "What are our most common problems?"

---

## 🤔 Common Questions

**Q: Do I need a Groq account?**  
A: Yes, for intelligent AI recommendations. Free tier available.

**Q: Can I use OpenAI instead of Groq?**  
A: Currently LISA is built for Groq, but you could modify the API client.

**Q: Is my data stored securely?**  
A: Yes. In production, use PostgreSQL with proper backups. Never commit API keys.

**Q: Can LISA automatically take actions?**  
A: No. LISA only recommends. You always approve/reject decisions.

**Q: How does LISA learn?**  
A: When you resolve a case, LISA stores the outcome. Future similar cases use this experience.

**Q: What happens if I don't have Groq configured?**  
A: LISA uses basic rule-based logic. It works but isn't as smart.

---

## 📚 Additional Documentation

- **AI_INTEGRATION_COMPLETE.md** - Details about the AI setup
- **IMPROVED_RESPONSES.md** - How LISA's response style works
- **docs/ARCHITECTURE.md** - Technical architecture details
- **docs/OPERATIONS.md** - Production deployment guide

---

## 🛟 Support & Issues

**Check the health endpoint:**
```bash
curl http://localhost:3000/api/health
```

This shows which services are active (Groq, database, cache).

**Common issues:**
- **"LISA uses local mode"** → Add `GROQ_API_KEY` to `.env`
- **"No cases shown"** → The app auto-seeds demo data on first load
- **"Analysis failed"** → Check your Groq API key is valid

---

## 📝 License

MIT - See LICENSE file for details

---

## 🎉 Get Started Now!

```bash
npm install
cp .env.example .env
# Add your GROQ_API_KEY to .env
npm run dev
```

**Open http://localhost:3000 and start exploring!**

LISA comes with demo data, so you can try everything immediately. Create a case, analyze it, resolve it, and watch LISA learn from your decisions.

**Questions?** Check the documentation files or open an issue on GitHub.
