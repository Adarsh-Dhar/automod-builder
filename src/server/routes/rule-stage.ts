import { Hono } from 'hono';
import { DEFAULT_AUTOMOD_RULE } from '../../shared/automod';
import { getCurrentRule, resetRuleStageState, runSimulation, saveCurrentRule } from '../services/automod.service';

export const ruleStage = new Hono();

ruleStage.get('/init', async (c) => {
  try {
    const rule = await getCurrentRule();
    const simulation = await runSimulation(rule);

    return c.json({
      status: 'success',
      rule,
      simulation,
    });
  } catch (error) {
    console.error('[RuleStage] init failed:', error);
    return c.json({ status: 'error', message: 'Failed to initialize RuleStage' }, 500);
  }
});

ruleStage.get('/rule', async (c) => {
  try {
    const rule = await getCurrentRule();
    return c.json({ status: 'success', rule });
  } catch (error) {
    console.error('[RuleStage] rule fetch failed:', error);
    return c.json({ status: 'error', message: 'Failed to load rule' }, 500);
  }
});

ruleStage.post('/rule', async (c) => {
  try {
    const payload = (await c.req.json()) as typeof DEFAULT_AUTOMOD_RULE;
    const saved = await saveCurrentRule(payload);
    return c.json({ status: 'success', rule: saved });
  } catch (error) {
    console.error('[RuleStage] rule save failed:', error);
    return c.json({ status: 'error', message: 'Failed to save rule' }, 500);
  }
});

ruleStage.post('/simulate', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    const rule = body?.rule ?? undefined;
    const result = await runSimulation(rule);
    return c.json({ status: 'success', simulation: result });
  } catch (error) {
    console.error('[RuleStage] simulate failed:', error);
    return c.json({ status: 'error', message: 'Failed to run simulation' }, 500);
  }
});

ruleStage.post('/reset', async (c) => {
  try {
    const rule = await resetRuleStageState();
    const simulation = await runSimulation(rule);

    return c.json({
      status: 'success',
      rule,
      simulation,
    });
  } catch (error) {
    console.error('[RuleStage] reset failed:', error);
    return c.json({ status: 'error', message: 'Failed to reset RuleStage' }, 500);
  }
});