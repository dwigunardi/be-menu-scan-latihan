-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "is_best_seller" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_recommended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "promo_price" DECIMAL(10,2),
ADD COLUMN     "rating" DECIMAL(2,1) NOT NULL DEFAULT 5.0,
ADD COLUMN     "review_count" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "menu_items_is_best_seller_idx" ON "menu_items"("is_best_seller");

-- CreateIndex
CREATE INDEX "menu_items_is_recommended_idx" ON "menu_items"("is_recommended");
