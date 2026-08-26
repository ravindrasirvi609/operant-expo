export async function readBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return request.json();
  return Object.fromEntries((await request.formData()).entries());
}

