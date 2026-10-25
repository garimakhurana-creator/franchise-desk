# GOLDEN_DIVERGENCES

None. Every expectation in GOLDEN.md passes (`tests/golden.test.ts`).

Notes where the engine adds something GOLDEN.md does not mention (not divergences):
- APP-014 and APP-017 both list a rented 300 sq ft ground-floor space at pin 572103. SPEC 6.2 says identical pin, size and floor on different names is a same-property signal, so APP-017 also carries SAME_PROPERTY_CLAIM. Its primary status and reason stay ON_HOLD / UNIT_ERROR as expected; APP-014 stays DECLINED / INVEST_LOW (a decline takes precedence and the overlap is listed as "also noted").
