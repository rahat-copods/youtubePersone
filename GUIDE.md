# YouTube Persona Chat - Setup Guide

This guide will walk you through setting up the YouTube Persona Chat application with all required services and configurations.

## Prerequisites

- Node.js 18+ installed
- A Supabase account
- An OpenAI API account
- An Apify account (for caption extraction)

## 1. Supabase Setup

### Create a New Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new account
2. Click "New Project" and fill in the details:
   - Project name: "youtube-persona-chat"
   - Database password: Choose a strong password
   - Region: Select the closest region to your users

### Database Setup

1. Navigate to the SQL Editor in your Supabase dashboard
2. Run the migration script from `supabase/migrations/001_initial_schema.sql`
3. This will create all necessary tables, indexes, RLS policies, and functions

### Environment Variables

Create a `.env.local` file in your project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
APIFY_API_TOKEN=your_apify_api_token
```

Get these values from:
- Supabase URL and Anon Key: Project Settings > API
- OpenAI API Key: OpenAI Platform > API Keys
- Apify Token: Apify Console > Settings > Integrations

## 2. OpenAI Setup

1. Sign up at [platform.openai.com](https://platform.openai.com)
2. Navigate to API Keys and create a new key
3. Add billing information (required for API usage)
4. Copy the API key to your `.env.local` file

## 3. Apify Setup

1. Create an account at [apify.com](https://apify.com)
2. Get free credits (sufficient for testing)
3. Go to Settings > Integrations to find your API token
4. Copy the token to your `.env.local` file

## 4. Supabase Edge Functions

Deploy the job processor edge function:

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link your project:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

4. Deploy the edge function:
   ```bash
   supabase functions deploy job-processor
   ```

5. Set up environment variables for the edge function:
   ```bash
   supabase secrets set OPENAI_API_KEY=your_openai_api_key
   supabase secrets set APIFY_API_TOKEN=your_apify_api_token
   ```

## 5. Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## 6. Production Deployment

### Using Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Using Netlify

1. Connect repository to Netlify
2. Build command: `npm run build`
3. Publish directory: `out`
4. Add environment variables in site settings

## 7. Background Job Processing

The application uses Supabase Edge Functions for background job processing:

- **Video Discovery**: Fetches YouTube channel videos in batches
- **Caption Extraction**: Processes video captions and generates embeddings

### Setting Up Automated Job Processing

To ensure jobs are processed automatically, set up a cron job to trigger the edge function:

```bash
# Add to your server's crontab (runs every minute)
* * * * * curl -X POST "https://your-project-ref.supabase.co/functions/v1/job-processor" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

Alternatively, use a service like GitHub Actions or Vercel Cron Jobs:

```yaml
# .github/workflows/process-jobs.yml
name: Process Background Jobs
on:
  schedule:
    - cron: '*/2 * * * *' # Every 2 minutes
jobs:
  process:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger job processor
        run: |
          curl -X POST "${{ secrets.SUPABASE_URL }}/functions/v1/job-processor" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_KEY }}"
```

## 8. Features Overview

### Persona Management
- Add YouTube channels by ID, username, or URL
- Automatic video discovery and caption processing
- Public/private persona settings

### Chat System
- Real-time streaming responses using OpenAI GPT-4
- Vector similarity search for relevant video content
- Persistent chat history for authenticated users
- Anonymous chat support for public personas

### Background Processing
- Non-blocking video discovery and caption extraction
- Progress tracking and error handling
- Automatic retry logic with exponential backoff
- Idempotency to prevent duplicate processing

## 9. Troubleshooting

### Common Issues

**"Channel not found" error**
- Verify the YouTube channel ID or username is correct
- Ensure the channel is public and has videos

**Caption extraction failing**
- Check Apify account has sufficient credits
- Verify API token is correct
- Some videos may not have captions available

**Jobs not processing**
- Ensure edge function is deployed correctly
- Check Supabase edge function logs
- Verify cron job is running (if using automated processing)

### Database Issues

**RLS policy errors**
- Verify you're authenticated when accessing protected resources
- Check that persona `is_public` is set correctly for public access

**Vector search not working**
- Ensure `vector` extension is enabled in Supabase
- Verify embeddings are being generated correctly
- Check OpenAI API key has sufficient credits

## 10. Security Considerations

- All API keys should be kept secure and never committed to version control
- Row Level Security (RLS) is enabled on all tables
- Authentication is required for persona creation
- Public personas allow anonymous viewing and chatting
- Edge functions run in isolated environments with minimal permissions

## 11. Scaling Considerations

- Use Supabase connection pooling for high traffic
- Implement rate limiting for API endpoints
- Consider using Redis for caching frequent queries
- Monitor OpenAI API usage and costs
- Set up alerts for failed jobs and system errors

For additional help, refer to the documentation for:
- [Supabase](https://supabase.com/docs)
- [Next.js App Router](https://nextjs.org/docs/app)
- [OpenAI API](https://platform.openai.com/docs)
- [Apify Platform](https://docs.apify.com)