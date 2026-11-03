import { getSupabaseClient } from '../server/supabase/supabaseClient';

export interface ReadOnlyCheckResult {
  step: string;
  config: {
    hasUrl: boolean;
    hasExpectedProjectRef: boolean;
    hasSecretKey: boolean;
    projectHost?: string;
    expectedProjectRef?: string;
    actualProjectRef?: string;
    isProjectRefMatched: boolean;
    isHttps: boolean;
    isTestProject: boolean;
  };
  network: {
    attempted: boolean;
    httpStatus?: number;
    authSuccess: boolean;
    error?: {
      code?: string;
      message?: string;
      details?: string;
      hint?: string;
    };
  };
  tables: {
    betinfo_odds_staging: {
      exists: boolean;
      readPermission: boolean;
      status?: number;
      rowCount?: number;
      sampleItem?: any;
      error?: string;
    };
    betinfo_odds_history_staging: {
      exists: boolean;
      readPermission: boolean;
      status?: number;
      rowCount?: number;
      sampleItem?: any;
      error?: string;
    };
  };
}

export async function runReadOnlySupabaseCheck(): Promise<ReadOnlyCheckResult> {
  const conn = getSupabaseClient();

  const result: ReadOnlyCheckResult = {
    step: 'READ_ONLY_INSPECTION',
    config: {
      hasUrl: conn.configDetails.hasUrl,
      hasExpectedProjectRef: conn.configDetails.hasExpectedProjectRef,
      hasSecretKey: conn.configDetails.hasSecretKey,
      projectHost: conn.configDetails.projectHost,
      expectedProjectRef: conn.configDetails.expectedProjectRef,
      actualProjectRef: conn.configDetails.actualProjectRef,
      isProjectRefMatched: conn.configDetails.isProjectRefMatched,
      isHttps: conn.configDetails.isHttps,
      isTestProject: conn.isTestProject
    },
    network: {
      attempted: false,
      authSuccess: false
    },
    tables: {
      betinfo_odds_staging: {
        exists: false,
        readPermission: false
      },
      betinfo_odds_history_staging: {
        exists: false,
        readPermission: false
      }
    }
  };

  if (!conn.client) {
    result.network.error = {
      message: conn.errorReason || 'CLIENT_INITIALIZATION_BLOCKED'
    };
    return result;
  }

  const supabase = conn.client;
  result.network.attempted = true;

  // 1. Check table: betinfo_odds_staging (Read at most 1 item, NO WRITE)
  try {
    const res1 = await supabase
      .from('betinfo_odds_staging')
      .select('*')
      .limit(1);

    result.network.httpStatus = res1.status;

    if (res1.error) {
      // 401, 403, 404 (PGRST204/PGRST205 etc)
      result.tables.betinfo_odds_staging.status = res1.status;
      result.tables.betinfo_odds_staging.error = `[${res1.error.code || res1.status}] ${res1.error.message}`;

      // PGRST204 or PGRST205 typically means table doesn't exist in the schema cache
      if (res1.error.code === '42P01' || res1.error.message.includes('does not exist') || res1.error.code === 'PGRST204' || res1.error.code === 'PGRST205') {
        result.tables.betinfo_odds_staging.exists = false;
        result.tables.betinfo_odds_staging.readPermission = false;
      } else if (res1.status === 401 || res1.status === 403) {
        result.tables.betinfo_odds_staging.exists = true; // might exist, but permission denied
        result.tables.betinfo_odds_staging.readPermission = false;
      } else {
        result.tables.betinfo_odds_staging.exists = false;
      }

      // Check if authentication succeeded based on HTTP status
      if (res1.status !== 401 && res1.status !== 403) {
        result.network.authSuccess = true;
      }
    } else {
      result.network.authSuccess = true;
      result.tables.betinfo_odds_staging.exists = true;
      result.tables.betinfo_odds_staging.readPermission = true;
      result.tables.betinfo_odds_staging.status = res1.status;
      result.tables.betinfo_odds_staging.rowCount = res1.data ? res1.data.length : 0;
      if (res1.data && res1.data.length > 0) {
        // Sanitize sample row without printing any potential secret
        result.tables.betinfo_odds_staging.sampleItem = res1.data[0];
      }
    }
  } catch (err: any) {
    result.tables.betinfo_odds_staging.error = err.message || String(err);
  }

  // 2. Check table: betinfo_odds_history_staging (Read at most 1 item, NO WRITE)
  try {
    const res2 = await supabase
      .from('betinfo_odds_history_staging')
      .select('*')
      .limit(1);

    if (res2.error) {
      result.tables.betinfo_odds_history_staging.status = res2.status;
      result.tables.betinfo_odds_history_staging.error = `[${res2.error.code || res2.status}] ${res2.error.message}`;

      if (res2.error.code === '42P01' || res2.error.message.includes('does not exist') || res2.error.code === 'PGRST204' || res2.error.code === 'PGRST205') {
        result.tables.betinfo_odds_history_staging.exists = false;
        result.tables.betinfo_odds_history_staging.readPermission = false;
      } else if (res2.status === 401 || res2.status === 403) {
        result.tables.betinfo_odds_history_staging.exists = true;
        result.tables.betinfo_odds_history_staging.readPermission = false;
      } else {
        result.tables.betinfo_odds_history_staging.exists = false;
      }

      if (res2.status !== 401 && res2.status !== 403) {
        result.network.authSuccess = true;
      }
    } else {
      result.network.authSuccess = true;
      result.tables.betinfo_odds_history_staging.exists = true;
      result.tables.betinfo_odds_history_staging.readPermission = true;
      result.tables.betinfo_odds_history_staging.status = res2.status;
      result.tables.betinfo_odds_history_staging.rowCount = res2.data ? res2.data.length : 0;
      if (res2.data && res2.data.length > 0) {
        result.tables.betinfo_odds_history_staging.sampleItem = res2.data[0];
      }
    }
  } catch (err: any) {
    result.tables.betinfo_odds_history_staging.error = err.message || String(err);
  }

  return result;
}

// If executed directly via CLI
if (process.argv[1]?.includes('check_supabase_read_only')) {
  runReadOnlySupabaseCheck()
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error("FATAL_ERROR:", err.message);
      process.exit(1);
    });
}
