-- AlterTable
ALTER TABLE "User"
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "passwordSetAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AdminPasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminPasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminPasswordResetToken_tokenHash_key" ON "AdminPasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminPasswordResetToken_userId_usedAt_idx" ON "AdminPasswordResetToken"("userId", "usedAt");

-- CreateIndex
CREATE INDEX "AdminPasswordResetToken_expiresAt_idx" ON "AdminPasswordResetToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "AdminPasswordResetToken" ADD CONSTRAINT "AdminPasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data API lockdown: this table is server-only, like the rest of War Room.
ALTER TABLE "AdminPasswordResetToken" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  api_roles TEXT;
BEGIN
  SELECT string_agg(quote_ident(rolname), ', ' ORDER BY rolname)
  INTO api_roles
  FROM pg_roles
  WHERE rolname = ANY (ARRAY['anon', 'authenticated', 'service_role']);

  IF api_roles IS NOT NULL THEN
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %s',
      'AdminPasswordResetToken',
      api_roles
    );
  END IF;
END $$;
