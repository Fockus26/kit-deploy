import { auth } from "@/lib/auth";
import { handleAuth } from "@/lib/auth/handler";

const handle = (request: Request) => handleAuth(request, { auth: auth() });

export const GET = handle;
export const POST = handle;
