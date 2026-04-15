const { log, generateId } = require('../utils/logger');

const FIREBERRY_API_URL = process.env.FIREBERRY_API_URL || 'https://api.powerlink.co.il/api';
const FIREBERRY_TOKEN = process.env.FIREBERRY_TOKEN;

/**
 * Query Fireberry API for records of a given object type.
 */
async function queryFireberry({ objecttype, fields, query, page_size = 100, page_number = 1 }) {
  const requestId = generateId();
  const startTime = Date.now();

  log('DEBUG', 'fireberry', 'API query', {
    requestId, objecttype, page_size, query: query?.substring(0, 100)
  });

  if (!FIREBERRY_TOKEN) {
    log('ERROR', 'fireberry', 'FIREBERRY_TOKEN not set', { requestId });
    return { success: false, error_details: 'Missing FIREBERRY_TOKEN' };
  }

  try {
    const response = await fetch(`${FIREBERRY_API_URL}/query`, {
      method: 'POST',
      headers: {
        'tokenid': FIREBERRY_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ objecttype, page_size, page_number, fields, query })
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      log('ERROR', 'fireberry', 'HTTP error', { requestId, status: response.status, duration });
      return { success: false, error_details: `HTTP ${response.status}` };
    }

    const data = await response.json();

    if (!data.success) {
      log('ERROR', 'fireberry', 'API error', {
        requestId, objecttype, error_details: data.error_details, duration
      });
      return data;
    }

    const records = data.data?.Data;
    log('INFO', 'fireberry', 'API query success', {
      requestId, objecttype, recordCount: Array.isArray(records) ? records.length : 0, duration
    });

    return data;
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'fireberry', 'API call failed', {
      requestId, objecttype, error: err.message, code: err.code, duration
    });
    return { success: false, error_details: err.message };
  }
}

/**
 * Fetch all pages of a query (auto-pagination).
 */
async function queryAllPages({ objecttype, fields, query, page_size = 500 }) {
  const startTime = Date.now();
  const requestId = generateId();
  log('DEBUG', 'fireberry', 'Entry: queryAllPages', { requestId, objecttype, page_size });

  const allRecords = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await queryFireberry({ objecttype, fields, query, page_size, page_number: page });
    if (!result.success) {
      const duration = Date.now() - startTime;
      log('ERROR', 'fireberry', 'queryAllPages failed on page', { requestId, objecttype, page, error: result.error_details, duration });
      return result;
    }

    const records = result.data?.Data || [];
    allRecords.push(...records);
    log('DEBUG', 'fireberry', 'Page fetched', { requestId, objecttype, page, pageRecords: records.length, totalSoFar: allRecords.length });

    hasMore = records.length === page_size;
    page++;
  }

  const duration = Date.now() - startTime;
  log('INFO', 'fireberry', 'Exit: queryAllPages', { requestId, objecttype, totalRecords: allRecords.length, pages: page - 1, duration });
  return { success: true, data: { Data: allRecords } };
}

/**
 * Get a single record by ID.
 */
async function getRecordById(objecttype, recordId) {
  const requestId = generateId();
  const startTime = Date.now();
  log('DEBUG', 'fireberry', 'Entry: getRecordById', { requestId, objecttype, recordId });

  try {
    const response = await fetch(`${FIREBERRY_API_URL}/record/${objecttype}/${recordId}`, {
      method: 'GET',
      headers: { 'tokenid': FIREBERRY_TOKEN, 'Content-Type': 'application/json' }
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      log('ERROR', 'fireberry', 'getRecordById HTTP error', { requestId, objecttype, recordId, status: response.status, duration });
      return { success: false, error_details: `HTTP ${response.status}` };
    }

    const data = await response.json();
    log('INFO', 'fireberry', 'Exit: getRecordById', { requestId, objecttype, recordId, success: data.success !== false, duration });
    return data;
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'fireberry', 'Get record failed', { requestId, objecttype, recordId, error: err.message, stack: err.stack, duration });
    return { success: false, error_details: err.message };
  }
}

/**
 * Update a record.
 */
async function updateRecord(objecttype, recordId, data) {
  const requestId = generateId();
  const startTime = Date.now();
  log('DEBUG', 'fireberry', 'Entry: updateRecord', { requestId, objecttype, recordId });

  try {
    const response = await fetch(`${FIREBERRY_API_URL}/record/${objecttype}/${recordId}`, {
      method: 'PUT',
      headers: { 'tokenid': FIREBERRY_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      log('ERROR', 'fireberry', 'updateRecord HTTP error', { requestId, objecttype, recordId, status: response.status, duration });
      return { success: false, error_details: `HTTP ${response.status}` };
    }

    const result = await response.json();
    log('INFO', 'fireberry', 'Exit: updateRecord', { requestId, objecttype, recordId, success: result.success !== false, duration });
    return result;
  } catch (err) {
    const duration = Date.now() - startTime;
    log('ERROR', 'fireberry', 'Update record failed', { requestId, objecttype, recordId, error: err.message, stack: err.stack, duration });
    return { success: false, error_details: err.message };
  }
}

module.exports = { queryFireberry, queryAllPages, getRecordById, updateRecord };
