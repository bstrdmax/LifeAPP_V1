// ============================================================
// Webhook Trigger Function
// Called when a new reminder is created (via database trigger or API call).
// Sends a JSON payload to the user's configured webhook URL.
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

exports.handler = async (event, context) => {
  // This function expects to be invoked with a POST containing the reminder ID
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { reminderId } = JSON.parse(event.body);
    if (!reminderId) {
      return { statusCode: 400, body: 'Missing reminderId' };
    }

    // Fetch the reminder with user info
    const { data: reminder, error: reminderError } = await supabase
      .from('reminders')
      .select('*, users!inner(email, settings!inner(webhook_url))')
      .eq('id', reminderId)
      .single();
    if (reminderError || !reminder) {
      return { statusCode: 404, body: 'Reminder not found' };
    }

    const webhookUrl = reminder.users.settings?.webhook_url;
    if (!webhookUrl) {
      // No webhook configured – silently ignore
      return { statusCode: 200, body: 'No webhook configured' };
    }

    // Prepare payload
    const payload = {
      id: reminder.id,
      title: reminder.title,
      description: reminder.description,
      due_date: reminder.due_date,
      category: reminder.category_id, // you could join category name
      cost_min: reminder.cost_consequence_min,
      cost_max: reminder.cost_consequence_max,
      user_email: reminder.users.email
    };

    // Send webhook
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook responded with ${response.status}`);
    }

    return {
      statusCode: 200,
      body: 'Webhook triggered successfully.'
    };
  } catch (error) {
    console.error('Error in webhook-trigger:', error);
    return {
      statusCode: 500,
      body: 'Internal Server Error'
    };
  }
};
