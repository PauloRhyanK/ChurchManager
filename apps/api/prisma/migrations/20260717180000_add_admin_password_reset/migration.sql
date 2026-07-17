-- CreateTable
CREATE TABLE "admin_password_resets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_password_resets_token_key" ON "admin_password_resets"("token");

-- CreateIndex
CREATE INDEX "admin_password_resets_user_id_idx" ON "admin_password_resets"("user_id");

-- CreateIndex
CREATE INDEX "admin_password_resets_email_idx" ON "admin_password_resets"("email");

-- AddForeignKey
ALTER TABLE "admin_password_resets" ADD CONSTRAINT "admin_password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
