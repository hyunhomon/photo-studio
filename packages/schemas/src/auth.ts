export const oauthMessages: Record<string, string> = {
  OAUTH_STATE_INVALID:
    "연결 요청이 만료됐거나 다른 브라우저에서 시작됐습니다. 이 창에서 다시 연결해 주세요.",
  OAUTH_CANCELLED:
    "OpenRouter 연결을 취소했습니다. 원할 때 다시 연결할 수 있습니다.",
  OAUTH_CODE_REJECTED:
    "OpenRouter가 인증 코드를 확인하지 못했습니다. 사용한 콜백을 새로고침하지 말고 연결을 처음부터 다시 시작해 주세요.",
  OAUTH_PROVIDER_TIMEOUT:
    "OpenRouter의 키 발급 응답 시간이 초과됐습니다. 다시 연결해 주세요.",
  OAUTH_PROVIDER_UNAVAILABLE:
    "OpenRouter 인증 서버에 연결하지 못했습니다. 잠시 후 다시 연결해 주세요.",
  OAUTH_PROVIDER_RATE_LIMITED:
    "OpenRouter 인증 요청이 많습니다. 잠시 후 다시 연결해 주세요.",
  OAUTH_PROVIDER_RESPONSE_INVALID:
    "OpenRouter가 올바른 연결 키 응답을 반환하지 않았습니다. 키를 저장하지 않았습니다.",
  OAUTH_IDENTITY_UNAVAILABLE:
    "OpenRouter에서 계정을 안전하게 식별할 정보를 받지 못했습니다. 다른 계정과 연결하지 않았습니다.",
  OAUTH_ACCOUNT_MISMATCH:
    "현재 스튜디오와 다른 OpenRouter 계정입니다. 원래 계정으로 다시 연결해 주세요.",
  OAUTH_CREDENTIAL_ERROR:
    "연결 요청의 보안 정보를 확인하지 못했습니다. 새 연결 요청으로 다시 시도해 주세요.",
  OAUTH_SERVER_CONFIGURATION:
    "서버의 키 암호화 설정을 확인해야 합니다. 연결 키는 브라우저에 노출되지 않았습니다.",
  OAUTH_STORAGE_FAILED:
    "계정 연결 정보를 저장하지 못했습니다. 다시 연결하면 기존 계정을 안전하게 이어서 확인합니다.",
  OAUTH_SESSION_FAILED:
    "계정 연결은 저장했지만 로그인 세션을 만들지 못했습니다. 다시 연결해 주세요.",
  ACCOUNT_DELETING:
    "계정 삭제가 진행 중입니다. 정리 완료 후 다시 연결해 주세요.",
  OAUTH_CONNECT_FAILED:
    "연결을 완료하지 못했습니다. 새 연결 요청으로 다시 시도해 주세요.",
};
