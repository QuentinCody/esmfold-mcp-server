import { describe, expect, it } from "vitest";
import { esmfoldCatalog } from "./catalog";

describe("esmfoldCatalog", () => {
	it("uses the official live ESM Atlas sample accession", () => {
		expect(esmfoldCatalog.notes).toContain("MGYP002537940442");
		expect(esmfoldCatalog.notes).not.toContain("MGYP000912776285");
		expect(esmfoldCatalog.endpoints[0].pathParams?.[0].description).toContain(
			"MGYP002537940442",
		);
	});
});
