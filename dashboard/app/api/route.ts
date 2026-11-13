/** Legacy /api — forward to forward-test status. */
import { GET as forwardGET } from "@/app/api/forward-test/route";

export const runtime = "nodejs";
export const GET = forwardGET;
