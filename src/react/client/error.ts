class GitApiClientError extends Error {
  code: string;
  details?: unknown;
  status: number;

  constructor(input: {
    code?: string;
    details?: unknown;
    message: string;
    status: number;
  }) {
    super(input.message);
    this.name = "GitApiClientError";
    this.code = String(input.code || "git_api_error");
    this.details = input.details;
    this.status = Number(input.status) || 500;
  }
}

async function parseJsonResponse(response: Response) {
  const bodyText = await response.text();
  if (!bodyText) return null;

  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    if (!response.ok) {
      throw new GitApiClientError({
        message: bodyText,
        status: response.status,
      });
    }

    throw new GitApiClientError({
      code: "invalid_json",
      message: "Git API response was not valid JSON.",
      status: response.status || 500,
    });
  }
}

export { GitApiClientError, parseJsonResponse };
