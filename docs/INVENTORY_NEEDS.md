# Inventory and Need to Purchase

Add Need searches existing active products with case-insensitive partial and similar spelling matches. Selecting a result stores the product UUID, displays stock and minimums per active location, and derives a suggested quantity from the aggregate target shortfall. Suggestions never change stock or order anything. An unmatched name can remain a text-only Need.

Location is not requested or saved on new Needs. Legacy location references remain in the database for historical integrity. Linked names render from the current product; original Need text remains an audited snapshot. Active Needs are product-wide across locations and purchase countries. Pending/Ordered entries block duplicate creation, including direct RPC calls with the old override flag. Done permits a later Need. Text-only similar-name warnings retain their explicit confirmation.

Migration `20260911000900_inventory_linked_needs.sql` adds a partial unique index and replaces the existing save RPC without changing RLS, history triggers or stock. It aborts if legacy active product duplicates exist: review those records manually rather than deleting or merging them automatically. New records must begin Pending. Existing records keep their original creator/time and legacy location reference.

This change does not depend on the pending staff-auth/account-admin migrations 007 and 008. Its independent production release is based on the last deployed version; the local main branch also retains the pending account-security implementation. Do not blindly push local main until that separate rollout is configured. When applying 007/008 after 009, use a reviewed `db push --linked --include-all --dry-run` first to inspect the older pending migrations.
