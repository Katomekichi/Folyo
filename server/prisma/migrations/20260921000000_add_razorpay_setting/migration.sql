-- CreateTable
CREATE TABLE "RazorpaySetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyId" TEXT,
    "keySecretEnc" TEXT,
    "webhookSecretEnc" TEXT,
    "accountId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RazorpaySetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RazorpaySetting_userId_key" ON "RazorpaySetting"("userId");

-- AddForeignKey
ALTER TABLE "RazorpaySetting" ADD CONSTRAINT "RazorpaySetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
