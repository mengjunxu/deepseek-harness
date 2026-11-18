# Plan

- [x] Step 1: audit existing TokenUsage, attempt records, route/source ownership and all current consumers; select a bounded complete slice and write failure-first evidence.
- [x] Step 2: implement the smallest accounting producer/data/consumer path using existing Session and projection owners; test replacement, retries, estimation labels and deduplication.
- [x] Step 3: verify real composition, retained/current Session/SDK surfaces as affected, durable compatibility and documentation.
- [x] Step 4: run scoped final checks and save exact-source evidence; update parent Plan status and checkpoint.
