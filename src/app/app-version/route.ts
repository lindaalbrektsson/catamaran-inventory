export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json(
    {
      version:
        process.env.VERCEL_GIT_COMMIT_SHA ||
        process.env.APP_RELEASE_VERSION ||
        process.env.VERCEL_DEPLOYMENT_ID ||
        'local',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
