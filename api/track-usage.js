import { createClient } from "@supabase/supabase-js";

// Service-role client — full DB access, server-side only. Never expose this key to the browser.
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CREDIT_COSTS = {
  ask_tutor: 1,
  quiz: 2,
  worksheet: 3,
  lesson: 5,
  ppt_lesson: 8,
};

// TODO: update these to your actual current Claude Sonnet per-token pricing
// (check https://www.anthropic.com/pricing) — this only feeds the internal
// usage_logs.estimated_cost analytics column, not real billing.
const PRICE_PER_TOKEN_INPUT = 0.000003;
const PRICE_PER_TOKEN_OUTPUT = 0.000015;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify the caller is who they say they are — never trust a userId from the request body.
  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.replace("Bearer ", "");
  if (!accessToken) {
    return res.status(401).json({ error: "Missing access token" });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
  const userId = userData.user.id;

  try {
    const { tool, inputTokens, outputTokens } = req.body || {};

    const cost = CREDIT_COSTS[tool];
    if (cost === undefined) {
      return res.status(400).json({ error: "Unknown tool: " + tool });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("credits, tokens_used")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: "Profile not found" });
    }
    if (profile.credits < cost) {
      return res.status(402).json({ error: "Not enough credits", credits: profile.credits });
    }

    const totalTokens = (inputTokens || 0) + (outputTokens || 0);
    const estimatedCost = (inputTokens || 0) * PRICE_PER_TOKEN_INPUT + (outputTokens || 0) * PRICE_PER_TOKEN_OUTPUT;
    const newCredits = profile.credits - cost;
    const newTokensUsed = (profile.tokens_used || 0) + totalTokens;

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ credits: newCredits, tokens_used: newTokensUsed })
      .eq("id", userId);
    if (updateError) throw updateError;

    await supabaseAdmin.from("credit_transactions").insert({
      user_id: userId,
      amount: -cost,
      reason: tool,
      balance_after: newCredits,
    });

    await supabaseAdmin.from("usage_logs").insert({
      user_id: userId,
      tool: tool,
      input_tokens: inputTokens || 0,
      output_tokens: outputTokens || 0,
      total_tokens: totalTokens,
      estimated_cost: estimatedCost,
    });

    return res.status(200).json({ credits: newCredits, tokensUsed: newTokensUsed });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || "Failed to track usage" });
  }
}
