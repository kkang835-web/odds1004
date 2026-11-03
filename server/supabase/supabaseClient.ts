import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConnectionResult {
  client: SupabaseClient | null;
  isConfigured: boolean;
  isTestProject: boolean;
  errorReason?: string;
  configDetails: {
    hasUrl: boolean;
    hasExpectedProjectRef: boolean;
    hasSecretKey: boolean;
    hasKey: boolean;
    hasServiceRoleKey: boolean;
    projectHost?: string;
    expectedProjectRef?: string;
    actualProjectRef?: string;
    isProjectRefMatched: boolean;
    isHttps: boolean;
    environment: string;
  };
}

/**
 * Returns an authenticated Supabase client for backend/staging usage only.
 * Strictly verifies safety constraints:
 * - Credentials are read exclusively from server-side environment variables.
 * - Reads server secret key with priority: SUPABASE_SECRET_KEY || SUPABASE_SERVICE_ROLE_KEY || ''
 * - Requires SUPABASE_URL, SUPABASE_EXPECTED_PROJECT_REF, and Server Secret Key to be present.
 * - Validates HTTPS protocol and valid host format.
 * - Validates project reference matches SUPABASE_EXPECTED_PROJECT_REF (fail-closed).
 * - Secret keys and sensitive auth tokens are NEVER printed or exposed.
 * - Confirms test/development environment.
 */
export function getSupabaseClient(): SupabaseConnectionResult {
  const url = process.env.SUPABASE_URL?.trim() || '';
  const expectedProjectRef = process.env.SUPABASE_EXPECTED_PROJECT_REF?.trim() || '';
  const secretKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '').trim();
  const nodeEnv = process.env.NODE_ENV || 'development';

  const hasUrl = Boolean(url.length > 0);
  const hasExpectedProjectRef = Boolean(expectedProjectRef.length > 0);
  const hasSecretKey = Boolean(secretKey.length > 0);
  const hasKey = Boolean(anonKey.length > 0);
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  let projectHost: string | undefined;
  let isHttps = false;
  let actualProjectRef: string | undefined;

  // 1. URL parsing & protocol/host validation
  if (hasUrl) {
    try {
      const parsed = new URL(url);
      projectHost = parsed.host;
      isHttps = parsed.protocol === 'https:';

      // Validate host format (e.g. <project-ref>.supabase.co or valid hostname)
      const hostname = parsed.hostname;
      const isValidHostFormat = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(hostname);

      if (isValidHostFormat) {
        // In standard supabase.co URLs: <project-ref>.supabase.co
        const segments = hostname.split('.');
        actualProjectRef = segments[0];
      } else {
        actualProjectRef = 'invalid-host';
      }
    } catch {
      projectHost = 'invalid-url';
      actualProjectRef = 'invalid-url';
    }
  }

  const isProjectRefMatched = Boolean(
    hasExpectedProjectRef &&
    actualProjectRef &&
    actualProjectRef.toLowerCase() === expectedProjectRef.toLowerCase()
  );

  // Explicit project reference matching (SUPABASE_EXPECTED_PROJECT_REF === actualProjectRef)
  // verifies that the connection target is the explicitly approved project ID (Requirement 2 & 3).
  // Production indicators (production env or prod. host) strictly block the connection.
  const lowerHost = (projectHost || '').toLowerCase();
  const explicitProductionSignal =
    process.env.SUPABASE_ENV === 'production' ||
    (nodeEnv === 'production' && process.env.SUPABASE_ENV !== 'test' && process.env.SUPABASE_ENV !== 'development') ||
    lowerHost.startsWith('prod-') ||
    lowerHost.includes('.prod.');

  const isTestProject = Boolean(isProjectRefMatched && !explicitProductionSignal);

  const baseConfigDetails = {
    hasUrl,
    hasExpectedProjectRef,
    hasSecretKey,
    hasKey,
    hasServiceRoleKey,
    projectHost,
    expectedProjectRef: hasExpectedProjectRef ? expectedProjectRef : undefined,
    actualProjectRef,
    isProjectRefMatched,
    isHttps,
    environment: nodeEnv
  };

  // Requirement 2 & 3: Fail-closed check for required trio (SUPABASE_URL, SUPABASE_EXPECTED_PROJECT_REF, Secret Key)
  const missingConfigs: string[] = [];
  if (!hasUrl) missingConfigs.push('SUPABASE_URL');
  if (!hasExpectedProjectRef) missingConfigs.push('SUPABASE_EXPECTED_PROJECT_REF');
  if (!hasSecretKey) missingConfigs.push('SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY');

  if (missingConfigs.length > 0) {
    return {
      client: null,
      isConfigured: false,
      isTestProject,
      errorReason: `MISSING_REQUIRED_CONFIGS: 필수 연결 설정이 누락되었습니다: ${missingConfigs.join(', ')}`,
      configDetails: baseConfigDetails
    };
  }

  // Requirement 4: Verify URL HTTPS and Host format
  if (!isHttps) {
    return {
      client: null,
      isConfigured: false,
      isTestProject,
      errorReason: 'INSECURE_PROTOCOL: SUPABASE_URL은 보안을 위해 반드시 HTTPS 프로토콜이어야 합니다.',
      configDetails: baseConfigDetails
    };
  }

  if (!projectHost || projectHost === 'invalid-url' || actualProjectRef === 'invalid-host') {
    return {
      client: null,
      isConfigured: false,
      isTestProject,
      errorReason: 'INVALID_HOST_FORMAT: SUPABASE_URL의 호스트 형식이 올바르지 않습니다 (예: https://<project-ref>.supabase.co).',
      configDetails: baseConfigDetails
    };
  }

  // Requirement 3: Verify project reference matches exactly (fail-closed)
  if (!isProjectRefMatched) {
    return {
      client: null,
      isConfigured: false,
      isTestProject,
      errorReason: `PROJECT_REF_MISMATCH: SUPABASE_URL에서 추출한 프로젝트 참조 ID(${actualProjectRef})와 SUPABASE_EXPECTED_PROJECT_REF(${expectedProjectRef})가 일치하지 않습니다.`,
      configDetails: baseConfigDetails
    };
  }

  // Environment test/dev safety verification
  if (!isTestProject) {
    return {
      client: null,
      isConfigured: false,
      isTestProject: false,
      errorReason: 'SAFETY_GUARD_BLOCKED: 운영(Production) 환경 또는 구분이 불확실한 프로젝트가 감지되어 쓰기 작업이 안전 가드에 의해 차단되었습니다.',
      configDetails: baseConfigDetails
    };
  }

  try {
    const client = createClient(url, secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    return {
      client,
      isConfigured: true,
      isTestProject: true,
      configDetails: baseConfigDetails
    };
  } catch (err: any) {
    return {
      client: null,
      isConfigured: false,
      isTestProject,
      errorReason: `SUPABASE_INIT_ERROR: 클라이언트 초기화 실패 (${err.message})`,
      configDetails: baseConfigDetails
    };
  }
}
