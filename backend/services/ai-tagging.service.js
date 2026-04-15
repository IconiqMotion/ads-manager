const db = require('../config/db');
const { log, generateId } = require('../utils/logger');

// Tag extraction patterns for when no AI API is configured
// Analyzes ad copy + CTA + URL to infer tags
function extractTagsFromMetadata(ad) {
  const tags = { colors: [], objects: [], mood: '', style: '', has_text_overlay: false, categories: [] };
  const text = [ad.body_text, ad.name, ad.cta_type, ad.link_url].filter(Boolean).join(' ').toLowerCase();

  // Mood detection from copy
  const moods = {
    urgent: ['limited', 'hurry', 'last chance', 'today only', 'now', 'dont miss', 'מוגבל', 'אחרון', 'מהרו'],
    professional: ['professional', 'expert', 'quality', 'premium', 'מקצועי', 'איכות', 'פרימיום'],
    friendly: ['welcome', 'join', 'free', 'easy', 'simple', 'בואו', 'חינם', 'קל', 'פשוט'],
    luxury: ['exclusive', 'luxury', 'vip', 'בלעדי', 'יוקרה'],
    discount: ['sale', 'off', '%', 'discount', 'deal', 'הנחה', 'מבצע', 'מכירה']
  };

  for (const [mood, keywords] of Object.entries(moods)) {
    if (keywords.some(k => text.includes(k))) {
      tags.mood = mood;
      break;
    }
  }

  // Style from CTA
  const ctaStyles = {
    LEARN_MORE: 'educational', SHOP_NOW: 'commercial', BOOK_NOW: 'booking',
    SIGN_UP: 'lead_gen', CONTACT_US: 'contact', GET_OFFER: 'promotional',
    SEND_MESSAGE: 'conversational', CALL_NOW: 'direct_response'
  };
  if (ad.cta_type && ctaStyles[ad.cta_type]) {
    tags.style = ctaStyles[ad.cta_type];
  }

  // Categories from text
  const categories = {
    beauty: ['beauty', 'skin', 'hair', 'nail', 'lash', 'brow', 'facial', 'יופי', 'עור', 'שיער', 'ציפורניים', 'גבות'],
    food: ['restaurant', 'food', 'menu', 'chef', 'eat', 'מסעדה', 'אוכל', 'שף'],
    fitness: ['gym', 'fit', 'workout', 'training', 'sport', 'כושר', 'אימון', 'ספורט'],
    medical: ['doctor', 'clinic', 'health', 'dental', 'רופא', 'מרפאה', 'בריאות', 'שיניים'],
    realestate: ['apartment', 'house', 'property', 'real estate', 'דירה', 'בית', 'נדלן', 'נכס'],
    education: ['course', 'learn', 'study', 'class', 'קורס', 'לימוד', 'סדנה']
  };

  for (const [cat, keywords] of Object.entries(categories)) {
    if (keywords.some(k => text.includes(k))) {
      tags.categories.push(cat);
    }
  }

  // Check for text overlay hint
  tags.has_text_overlay = !!(ad.body_text && ad.body_text.length > 20);

  return tags;
}

async function tagAd(adId) {
  const startTime = Date.now();
  log('DEBUG', 'ai-tagging', 'Entry: tagAd', { adId });

  try {
    const ad = await db('ads').where({ id: adId }).first();
    if (!ad) {
      log('WARN', 'ai-tagging', 'Ad not found', { adId });
      return null;
    }

    // Already tagged?
    if (ad.ai_tagged_at) {
      log('DEBUG', 'ai-tagging', 'Already tagged', { adId });
      return ad.ai_tags;
    }

    const tags = extractTagsFromMetadata(ad);

    await db('ads').where({ id: adId }).update({
      ai_tags: JSON.stringify(tags),
      ai_tagged_at: new Date()
    });

    log('INFO', 'ai-tagging', 'Exit: tagAd', { adId, tags: Object.keys(tags), duration: Date.now() - startTime });
    return tags;
  } catch (err) {
    log('ERROR', 'ai-tagging', 'Error in tagAd', { adId, error: err.message, duration: Date.now() - startTime });
    throw err;
  }
}

async function tagUntaggedAds({ limit = 100 } = {}) {
  const startTime = Date.now();
  const batchId = generateId();
  log('INFO', 'ai-tagging', '=== BATCH TAGGING START ===', { batchId, limit });

  try {
    const untagged = await db('ads')
      .whereNull('ai_tagged_at')
      .limit(limit)
      .select('id');

    let tagged = 0, errors = 0;

    for (const ad of untagged) {
      try {
        await tagAd(ad.id);
        tagged++;
      } catch {
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    log('INFO', 'ai-tagging', '=== BATCH TAGGING COMPLETE ===', { batchId, total: untagged.length, tagged, errors, duration });

    return { total: untagged.length, tagged, errors };
  } catch (err) {
    log('ERROR', 'ai-tagging', 'Batch tagging failed', { batchId, error: err.message, duration: Date.now() - startTime });
    throw err;
  }
}

module.exports = { tagAd, tagUntaggedAds, extractTagsFromMetadata };
