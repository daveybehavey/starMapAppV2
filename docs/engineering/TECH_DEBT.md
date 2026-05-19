# Technical debt register

Format: **item → why it matters → suggested direction → cost**

## UI / frontend

1. **Monolithic editor shell** (`EditorExperience`, related hooks)  
   - **Matter:** Every change risks unrelated UX; reviews are slow.  
   - **Direction:** Extract sections (toolbar, paywall, canvas host, mobile layout) behind stable props; keep Zustand contract.  
   - **Cost:** Medium; requires visual regression discipline (Playwright already exists).

2. **Parallel editor entry points** (`SimplifiedEditor` vs full editor)  
   - **Matter:** Duplicate behavior paths over time.  
   - **Direction:** Document which is canonical for new work; consolidate shared logic only in hooks/lib.  
   - **Cost:** Low–medium.

## Backend / data

3. **KV key proliferation**  
   - **Matter:** Hard to garbage-collect, migrate, or audit without a registry.  
   - **Direction:** Maintain a single `kvKeys.ts` or table in docs listing prefixes, TTLs, and owning module.  
   - **Cost:** Low.

4. **Webhook handler size**  
   - **Matter:** Hard to test each branch in isolation.  
   - **Direction:** Move “effects” into named functions with explicit inputs/outputs; keep route as orchestrator.  
   - **Cost:** Medium.

## Repository

5. **Legacy root static/site**  
   - **Matter:** Confuses contributors; tooling edge cases.  
   - **Direction:** Archive to `legacy/` with README, or delete if truly unused (verify deploy pipeline first).  
   - **Cost:** Low if unused; high if something still serves those files.

## Testing

6. **Unit vs E2E balance**  
   - **Matter:** E2E catches real issues but is slower/flakier at scale.  
   - **Direction:** Unit-test pricing/margin/key builders; keep E2E for money paths.  
   - **Cost:** Ongoing.
