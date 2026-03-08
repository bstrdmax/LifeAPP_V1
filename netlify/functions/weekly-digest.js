/**
 * Weekly Digest Function (Netlify Background Function)
 * Scheduled to run every Monday at 8 AM.
 */

const { createClient } = require('@supabase/supabase-js');

// These environment variables must be configured in your Netlify dashboard
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Netlify Cron Syntax: Every Monday at 08:00
// @cron 0 8 * * 1
exports.handler = async (event, context) => {
  // Security: Only allow Netlify's scheduler to trigger this
  if (event.headers['x-netlify-scheduled'] !== 'true') {
    return { statusCode: 403, body: 'Access Forbidden' };
  }

  try {
    // 1. Fetch active users
    const { data: users, error: userError } = await supabase
      .from('profiles') // Assuming you have a profiles or users table
      .select('id, email, full_name');
    
    if (userError) throw userError;

    // 2. Iterate and generate digests
    const digestResults = [];
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    for (const user of users) {
      const { data: upcoming, error: remError } = await supabase
        .from('reminders')
        .select('title, due_date, categories(name)')
        .eq('user_id', user.id)
        .eq('status', 'upcoming')
        .lte('due_date', sevenDaysFromNow.toISOString())
        .order('due_date', { ascending: true });

      if (remError) {
        console.error(`Error fetching reminders for ${user.email}:`, remError);
        continue;
      }

      // 3. Email Logic Placeholder
      // You would typically use Resend, SendGrid, or Postmark here.
      if (upcoming.length > 0) {
        const taskSummary = upcoming.map(r => 
          `• ${r.title} [${r.categories?.name || 'General'}] - ${new Date(r.due_date).toLocaleDateString()}`
        ).join('\n');

        const message = `
          Hello ${user.full_name || 'User'},
          
          Your Weekly LifeDesk Digest is ready. You have ${upcoming.length} actions required this week:
          
          ${taskSummary}
          
          Log in to your dashboard to manage these operations.
          Stay Ready.
        `;

        // console.log(`[Email Sent to ${user.email}]`, message);
        digestResults.push({ email: user.email, count: upcoming.length });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "Digest Complete",
        processed: digestResults.length
      })
    };

  } catch (error) {
    console.error('Fatal Digest Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
