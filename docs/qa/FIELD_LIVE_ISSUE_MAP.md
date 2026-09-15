# Field Live Issue Map

| Level | GitHub issue | Issue goal | Depends on | Release effect |
|---|---:|---|---|---|
| L0 | #12 | execute current-head source/.NET/PowerShell validation | none | blocks all merge/promotion |
| L1 | #13 | provision and destroy one synthetic isolated Hyper-V Field generation | #12 | proves VM/storage boundary only |
| L2 | #14 | integrate authenticated channel, durable replay state, key rotation, and heartbeat | #13 | blocks guest trust/readiness |
| L3 | #15 | prove bootstrap/display/lock/Secure Desktop/lifecycle/destruction | #14 | blocks any operating mode |
| L4-L5 | #16 | live scene producer and privacy-safe Teach hooks | #15 | blocks Teach/Shadow |
| L6 | #17 | live artifact broker with reparse and TOCTOU controls | #15 | blocks file workflows |
| L7 | #18 | actual Shadow predictor with process-level no-input proof | #16 | blocks learned behavior promotion |
| L8 | #19 | one synthetic Pilot workflow with physical emergency stop | #16, #17, #18 | blocks any autonomy claim |

The draft PR remains the parent tracking item until executable validation succeeds.
