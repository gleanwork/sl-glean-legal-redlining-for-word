// Hardcoded test data for admin connection tests
// Used by the admin-tests screen to run smoke tests against all three agents

export const TEST_CHAT_QUESTION = 'What are the payment terms?';

export const TEST_CONTRACT = `TERMS OF SERVICE

This Terms of Service agreement ("Agreement") is entered into as of the date last signed below (the "Effective Date") by and between Glean Technologies, Inc., a Delaware corporation, headquartered at 260 Sheridan Avenue, Suite 300, Palo Alto, CA 94306, USA ("Glean"), and [CUSTOMER LEGAL ENTITY NAME], with its principal office at [CUSTOMER ADDRESS], acting on behalf of itself and its Affiliates ("Customer"). This Agreement includes and incorporates any exhibits referenced in this Agreement, any Order Forms, DPA, BAA (as applicable), or other agreement related to the Service and executed by the parties. Glean and Customer may be referred to in this Agreement individually as a "party" and collectively as the "parties."

Introduction to Glean: Glean is the Work AI Platform connected to all your data, enabling everyone to find knowledge, generate content, and automate work with AI. Glean customers choose which of their applications are connected to Glean's service. For all connected applications, the Glean service mirrors the permissions and identity data of such applications, maintaining the applicable security rules. Glean also provides its customers with configurable hosting and large language model options.

Service Access and Configurations.
1.1 Access. Subject to the terms of this Agreement, Customer and its Users may access and use the Service during the Subscription Term in accordance with the applicable Order Form and Documentation. Customer may permit its Affiliates (and any third party authorized by Customer to manage the Service on Customer's behalf) to act as Users provided that any such use is solely for the benefit of Customer. Customer is responsible for each User's compliance with this Agreement, for each User's actions while using the Service, and for maintaining the security of each User's username and password.
1.2 Hosting Rights. Customer has the right to deploy the Service utilizing either of the following hosting options: (i) deployment in Customer's Cloud Service Provider Account, or (ii) deployment in Glean's Cloud Service Provider Account. If deployed in Glean's Cloud Service Provider Account, Customer may further select any supported Cloud Service Provider in any supported hosting region. 1.3 LLM Rights. For any Service utilizing generative AI: (i) Customer has the right to utilize any supported large language models ("LLMs") licensed from any supported LLM Provider, and (ii) Glean and Customer will comply with the AI terms incorporated herein by reference and found in Exhibit A ("AI Addendum"). 1.4 Customer Affiliates. Customer Affiliates may purchase the Service from Glean by executing an Order Form which is governed by the terms of this Agreement. This will establish a new and separate agreement between the Customer Affiliate and the Glean entity signing such Order Form. If the Customer Affiliate resides in a different country than Customer, then the Order Form may include modifications to terms applicable to the transaction(s) (including, but not limited to, taxes and governing law).
Restrictions. Customer will not (and will not permit its Users or any third party to): (a) sell, rent, assign, sublicense, or distribute the Service, or provide the Service as a commercial hosted service, to any third party; (b) provide access to, or otherwise make available, the Service to any third party (except as expressly set forth in Section 1.1); (c) modify, copy, translate, or create derivative works of, the Service; (d) reverse engineer, decompile, disassemble, or otherwise seek to obtain or derive the source code or non-public APIs or algorithms of the Service, except to the extent expressly permitted by applicable law (and then only upon advance written notice to Glean); (e) remove or obscure any copyright or proprietary notices contained in the Service; (f) use the Service in violation of applicable law or the Acceptable Use Policy; or (g) use the Service to benchmark the Service, to perform competitive analyses, to copy features or functions of the Service, or to build similar or competitive products or services.
Customer Data. 3.1 Rights in Customer Data. As between the parties, Customer or its licensors retain all right, title, and interest (including any and all intellectual property rights) in and to the Customer Data and any modifications made thereto in the course of operation of the Service, including Input and Output. Subject to the terms of this Agreement, Customer hereby grants to Glean and its Affiliates a non-exclusive, worldwide, non-transferable, and royalty-free right, during the Subscription Term, to process the Customer Data solely for the purpose of providing the Service to Customer or to prevent or address service or technical problems therein.
3.2 Customer Obligations. (a) In General. Customer is solely responsible for the accuracy, content and legality of all Customer Data. Customer warrants that (i) Customer's use of the Service in accordance with this Agreement will comply with applicable laws and government regulations, and (ii) Customer has and will have sufficient rights in the Customer Data to grant the rights to Glean under this Agreement and that the processing of Customer Data by Glean in accordance with this Agreement will not violate any laws, government regulations, any other legal requirements, or the rights of any third party. (b) HIPAA Data. To the extent applicable, unless Customer has entered into a BAA with Glean, Customer agrees (i) not to process any HIPAA Data via the Service, and (ii) Glean will have no liability under this Agreement for HIPAA Data, notwithstanding anything to the contrary in this Agreement or in HIPAA or any similar laws, rules or regulations. Upon mutual execution of the BAA, the BAA is incorporated by reference into this Agreement and is subject to its terms.
Title and Licenses. 4.1 Title by Glean. Glean and its licensors retain all right, title, and interest in all intellectual property rights, including patent, trademark, trade secret, trade name and copyright, whether registered or not registered, in and to the Service and the underlying technology thereof, the Documentation, and any derivative works, modifications, or improvements to any of the foregoing, and anonymized and aggregated information about all Glean's customers' use and interaction with the Service (which is inherent to Glean's provision of the Service). Glean reserves all rights in the Service not expressly granted herein, and no other license or implied rights of any kind are granted or conveyed. 4.2 Feedback. Glean may freely freely upon prior written consent of Customer use and incorporate into Glean's products and services any suggestions, corrections, enhancement requests, or other feedback provided to Glean by Customer or Users of the Service ("Feedback"), provided that Glean's use of such Feedback is anonymized and does not use Customer's Confidential Information or identify Customer or any User in any manner.
Fees. 5.1 Fees and Payment. If Customer is purchasing the Service via a Reseller, then all pricing and payment terms will be determined by and between Customer and such Reseller. If Customer is purchasing the Service directly from Glean, Customer shall pay to Glean (or the Glean Affiliate identified in the applicable Order Form) the fees set forth in each applicable Order Form (the "Fees"). Any use of the Service by Customer in excess of the licenses granted in the applicable Order Form is subject to billing in arrears by Glean (or Reseller). All Fees payable to Glean under this Agreement shall be paid in United States Dollars (or the currency identified in the applicable Order Form). Payment terms shall be specified in the applicable Order Form. All Fees (not otherwise duly in dispute in accordance with Section 5.2 (Payment Disputes)) will be paid by Customer within thirty (30) days of the invoice date, unless otherwise specified in the applicable Order Form. 5.2 Payment Disputes. Nothing in this Agreement prohibits Customer from making good faith disputes of amounts invoiced by Glean ("Payment Dispute"). Glean will not exercise its rights under Section 12.2 (with respect to termination for cause or suspension of the Service) with respect to non-payment by Customer in the event of a Payment Dispute. If the parties are unable to resolve such Payment Dispute within thirty (30) days, each party shall have the right to seek any remedies it may have under this Agreement, at law or in equity. For clarity, any undisputed amounts must be paid in full.
5.3 Taxes. All Fees are exclusive of taxes, duties, levies, tariffs, and other governmental charges including, without limitation, VAT, GST, or similar withholding taxes or obligations (collectively, "Taxes"). Customer shall be responsible for paying all Taxes associated with the Service (without any offset or deduction to the fees paid to Glean) other than taxes based on Glean's net income, and Customer may not reduce the fees payable to Glean as a result of Taxes.
Support, Technical Services, and Security. 6.1 Support. During the Subscription Term, Glean will provide Customer the support and service levels for the Service as specified in the Order Form ("Support"), in accordance with Glean's Customer Support Service Level Agreement. 6.2 Technical Services. If identified in an applicable Order Form, Glean will provide Customer with the Glean-branded technical assistance for the Service identified in the Order Form ("Technical Services"). 6.3 Security Standard. Glean will use commercially reasonable technical and organizational measures designed to prevent unauthorized access, use, or disclosure of Customer Data.
Trials. 7.1 Trial Use. At Customer's request, Glean may make available to Customer trial or evaluation use of the Service ("Trials"). Trials may include partial features or functionality of the Service. Customer may access and use Trials solely for the purpose of evaluating and testing the Service. Except for paid Trials, Glean may terminate Customer's access to any Trial at any time. 7.2 Trial Liability. Except for Customer-paid Trials: (i) Trials are provided "as is" without Support, indemnification, or warranty of any kind, and (ii) Glean's maximum aggregate liability under any Trial shall be capped at fifty thousand dollars US ($50,000 US).
Warranties and Disclaimers. 8.1 Glean Warranty. Glean warrants that the Service will perform in all material respects in accordance with the Documentation during the Subscription Term. 8.2 Exclusions. The warranty does not apply to unavailability or non-conforming functionality arising from factors outside of Glean's reasonable control. 8.3 Warranty Disclaimer. EXCEPT AS EXPRESSLY SET FORTH IN THIS AGREEMENT, THE SERVICE AND ANY OUTPUT IS PROVIDED "AS IS," AND GLEAN DISCLAIMS ALL OTHER WARRANTIES, EXPRESS, IMPLIED, OR STATUTORY.
Confidentiality. 9.1 Obligations. Each Receiving Party shall protect the Confidential Information of the Disclosing Party using the same degree of care that it uses to protect its own confidential information (but not less than reasonable care).
Indemnification. 10.1 By Glean. Glean will defend, indemnify, and hold Customer harmless from third party claims alleging the Service infringes a copyright, trademark, or patent, or misappropriates a trade secret. 10.2 By Customer. Customer will defend, indemnify, and hold Glean harmless from third party claims arising from Customer Data.
Limitation of Liability. EXCEPT AS TO "EXCLUDED CLAIMS," EACH PARTY'S AGGREGATE LIABILITY SHALL NOT EXCEED THE AMOUNT PAID OR PAYABLE BY CUSTOMER FOR THE SERVICE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
Subscription Term; Termination. 12.1 Term. This Agreement is effective as of the Effective Date and will remain in effect until terminated. 12.2 Termination for Cause. Either party may terminate if the other party materially breaches and fails to cure within 30 days. 12.3 Effect of Termination. Upon termination, Glean will delete Customer Data and Customer shall discontinue use.
General Provisions. 13.1 Governing Law. This Agreement will be governed by the laws of the State of Delaware. 13.5 No Assignment. Neither party may assign without prior written consent except in connection with a merger or acquisition.
Definitions. "Service" means Glean's software-as-a-service offerings. "Subscription Term" means the specified period of access. "Users" means persons allowed access by Customer.

In Witness Whereof, the parties' authorized representatives hereby agree to this Agreement as of the Effective Date.`;

export const TEST_TEMPLATE = `TERMS OF SERVICE
(Sample agreement for redlining workflow testing only — not a binding contract.)

This Terms of Service agreement ("Agreement") is entered into as of the date last signed below (the "Effective Date") by and between Example AI Services, Inc., a Delaware corporation ("Provider"), and the entity identified in the signature block below ("Customer").

This Agreement includes and incorporates any exhibits referenced in this Agreement, any Order Forms, data processing terms, business associate agreements (if applicable), or other agreements related to the Service and executed by the parties.

Provider and Customer may be referred to in this Agreement individually as a "party" and collectively as the "parties."

Introduction to the Service
Introduction to Provider: Provider offers a work intelligence platform connected to supported business systems, enabling users to find knowledge, generate content, and automate workflows with AI.

Customer may choose which third-party applications are connected to the Service. For all connected applications, the Service is designed to mirror the permissions and identity data of such applications, maintaining the applicable access rules. Provider may also make available configurable hosting and large language model ("LLM") options, as further described in the applicable Order Form and documentation.

1. Service Access and Configurations
1.1 Access
Subject to the terms of this Agreement, Customer and its Users may access and use the Service during the Subscription Term in accordance with the applicable Order Form and Documentation.

Customer may permit its Affiliates (and any third party authorized by Customer to manage the Service on Customer's behalf) to act as Users, provided that any such use is solely for the benefit of Customer. Customer is responsible for:
each User's compliance with this Agreement;
each User's actions while using the Service; and
maintaining the security of each User's account credentials.

1.2 Hosting Rights
Customer has the right to deploy the Service using either of the following hosting options:
deployment in Customer's cloud account with a supported cloud service provider; or
deployment in Provider's cloud account with a supported cloud service provider.

If deployed in Provider's cloud account, Customer may further select from the supported regions listed in the applicable Documentation or Order Form.

1.3 LLM Rights
For any Service components that utilize generative AI:
Customer has the right to utilize any supported LLMs licensed from a supported LLM provider; and
Provider and Customer will comply with the applicable AI terms made available by Provider (the "AI Addendum"), which are incorporated into this Agreement by reference where identified in an Order Form.

1.4 Customer Affiliates
Customer Affiliates may purchase the Service from Provider by executing an Order Form governed by this Agreement. This will establish a new and separate agreement between the Customer Affiliate and the Provider entity signing such Order Form.

If the Customer Affiliate resides in a different country than Customer, the Order Form may include modifications to terms applicable to the transaction(s) (including, but not limited to, taxes and governing law).

2. Restrictions
Customer will not (and will not permit its Users or any third party to):
a. sell, rent, assign, sublicense, or distribute the Service, or provide the Service as a commercial hosted service to any third party (except as expressly permitted in this Agreement);
b. provide access to, or otherwise make available, the Service to any third party except as expressly set forth in Section 1.1;
c. modify, copy, translate, or create derivative works of the Service;
d. reverse engineer, decompile, disassemble, or otherwise seek to obtain or derive the source code, non-public APIs, or algorithms of the Service, except to the extent expressly permitted by applicable law;
e. remove or obscure any copyright, trademark, or proprietary notices contained in the Service;
f. use the Service in violation of applicable law or Provider's acceptable use policy (if referenced in an Order Form); or
g. use the Service to benchmark or perform competitive analyses of the Service, copy its features or functions, or build similar or competitive products or services.

3. Customer Data
3.1 Rights in Customer Data
As between the parties, Customer or its licensors retain all right, title, and interest (including all intellectual property rights) in and to Customer Data and any modifications made thereto in the course of operation of the Service, including any Input and Output.

Subject to the terms of this Agreement, Customer hereby grants to Provider and its Affiliates a non-exclusive, worldwide, non-transferable, royalty-free right, during the Subscription Term, to process Customer Data solely:
to provide, maintain, secure, and support the Service; or
to prevent or address service or technical problems.

3.2 Customer Obligations
(a) In General.
Customer is solely responsible for the accuracy, content, and legality of all Customer Data. Customer represents and warrants that:
Customer's use of the Service in accordance with this Agreement will comply with applicable laws and governmental regulations; and
Customer has and will retain sufficient rights in Customer Data to grant the rights to Provider under this Agreement and that Provider's processing of Customer Data in accordance with this Agreement will not violate any law or the rights of any third party.

(b) Regulated Data.
To the extent applicable, unless the parties have entered into specific data protection terms (for example, a business associate agreement for protected health information):
Customer agrees not to intentionally submit to the Service any data that is subject to specialized regulatory regimes requiring such additional terms; and
Provider will have no liability under this Agreement for any such data processed in violation of this subsection, notwithstanding anything to the contrary in this Agreement.

4. Title and Licenses
4.1 Title by Provider
Provider and its licensors retain all right, title, and interest in and to:
the Service and underlying technology;
the Documentation; and
any derivative works, modifications, or improvements to any of the foregoing,
as well as anonymized and aggregated information about customer use and interaction with the Service (which is inherent to Provider's provision of the Service).

Provider reserves all rights in and to the Service not expressly granted in this Agreement.

4.2 Feedback
Provider may freely use and incorporate into its products and services any suggestions, corrections, enhancement requests, or other feedback provided by Customer or Users of the Service ("Feedback"), provided that Provider's use of such Feedback is anonymized and does not identify Customer or any User.

5. Fees
5.1 Fees and Payment
If Customer purchases the Service through a reseller, all pricing and payment terms will be determined between Customer and such reseller.

If Customer purchases the Service directly from Provider, Customer shall pay to Provider (or the Provider Affiliate identified in the applicable Order Form) the fees set forth in each applicable Order Form (the "Fees"). Any use of the Service in excess of the licenses or quantities stated in the Order Form may be billed in arrears by Provider (or by the reseller, if applicable).

Unless otherwise specified in an Order Form, all Fees are due within thirty (30) days from the invoice date.

5.2 Payment Disputes
Customer may in good faith dispute amounts invoiced by Provider (a "Payment Dispute"). Provider will not exercise its rights with respect to suspension or termination of the Service for non-payment during an active Payment Dispute, provided Customer is cooperating in good faith to resolve the dispute.

Customer must pay all undisputed amounts when due.

5.3 Taxes
All Fees are exclusive of taxes, duties, levies, tariffs, and other governmental charges (collectively, "Taxes"). Customer is responsible for all Taxes associated with the Service (other than taxes based on Provider's net income) and may not withhold or reduce Fees due to Taxes.

5.4 Reseller Order Forms
For any Order Forms placed through a reseller, Customer acknowledges and agrees that:
Provider may share information with such reseller related to Customer's use of the Service for account management and billing purposes; and
the reseller is not authorized to modify this Agreement or make any commitments on behalf of Provider.

6. Support, Professional Services, and Security
6.1 Support
During the Subscription Term, Provider will provide Customer with support and service levels for the Service as specified in the applicable Order Form or support documentation ("Support").

6.2 Professional or Technical Services
If identified in an applicable Order Form, Provider will provide Customer with implementation, configuration, or other technical services related to the Service ("Technical Services"), in accordance with Provider's then-current technical services terms.

6.3 Security
Provider will use commercially reasonable technical and organizational measures designed to protect Customer Data against unauthorized access, use, or disclosure in accordance with Provider's security documentation or policy referenced in the applicable Order Form (the "Security Standard").

6.4 Updates to Business Exhibits
Provider may update the terms of its support, security, and acceptable use documentation (collectively, the "Business Exhibits") from time to time to reflect process improvements, changes in technology, or legal requirements, provided that such updates:
do not materially diminish Provider's obligations; and
do not materially increase Customer's obligations,
during the applicable Subscription Term.

7. Trials
7.1 Trial Use
At Customer's request (including via an Order Form), Provider may make available to Customer trial or evaluation access to the Service, including pre-release or beta features ("Trials"). Trials may include limited or experimental features.

Customer may use Trials solely to evaluate and test the Service. Except for paid Trials, Provider may terminate Customer's access to and use of any Trial at any time.

7.2 Trial Liability
Except for Customer-paid Trials:
Trials are provided "as is" without support, indemnification, or warranty of any kind; and
notwithstanding any limitation of liability stated elsewhere, Provider's maximum aggregate liability for any claims arising from or relating to a Trial is capped at fifty thousand U.S. dollars (US$50,000).

8. Warranties and Disclaimers
8.1 Provider Warranty
Provider warrants that, during the Subscription Term, the Service will perform in all material respects in accordance with the Documentation.

As Customer's sole and exclusive remedy for a breach of this warranty, Provider will use commercially reasonable efforts to correct the reported non-conformity at no additional charge, or, if Provider determines such remedy is not commercially practicable, either party may terminate the applicable Order Form and Customer will receive a prorated refund of prepaid Fees for the remaining Subscription Term.

8.2 Exclusions
The warranty in Section 8.1 does not apply to any unavailability or non-conforming functionality resulting from:
factors outside of Provider's reasonable control;
Customer's failure to promptly notify Provider of the alleged non-conformity;
misuse or unauthorized modification of the Service;
performance issues or unavailability of Customer's own cloud environment or connected applications; or
Provider's suspension or termination of Customer's access in accordance with this Agreement.

8.3 Warranty Disclaimer
EXCEPT AS EXPRESSLY SET FORTH IN THIS AGREEMENT, THE SERVICE AND ANY OUTPUT ARE PROVIDED "AS IS", AND PROVIDER DISCLAIMS ALL OTHER WARRANTIES, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING ANY WARRANTIES OF MERCHANTABILITY, TITLE, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. PROVIDER DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED OR ERROR-FREE.

8.4 Compliance with Laws
Provider will provide the Service in accordance with laws and government regulations generally applicable to Provider's provision of the Service to its customers, without regard to Customer's particular use of the Service.

9. Confidentiality
9.1 Obligations
Each Receiving Party shall protect the Confidential Information of the Disclosing Party using at least the same degree of care it uses to protect its own confidential information (but not less than reasonable care). The Receiving Party shall:
not use or disclose any Confidential Information of the Disclosing Party except as necessary to perform its obligations or exercise its rights under this Agreement; and
limit access to Confidential Information of the Disclosing Party to its and its Affiliates' employees and contractors who have a need to know such information and are bound by confidentiality obligations not materially less protective than those in this Agreement.

9.2 Required Disclosures
If the Receiving Party is required by law or court order to disclose Confidential Information, it will, to the extent legally permitted, provide the Disclosing Party with prompt prior written notice and reasonably cooperate in efforts to seek protective or confidential treatment.

10. Indemnification
10.1 By Provider
Provider will defend, indemnify, and hold Customer harmless from and against any third-party claim alleging that Customer's authorized use of the Service infringes a valid copyright, trademark, or patent, or misappropriates a trade secret, and will pay any resulting damages finally awarded by a court or agreed in settlement.

10.2 By Customer
Customer will defend, indemnify, and hold Provider harmless from and against any third-party claim arising from or relating to:
Customer Data; or
any Customer-offered product or service used in connection with the Service.

10.3 Procedure
The indemnified party must promptly notify the indemnifying party in writing of the claim, give the indemnifying party sole control of the defense and settlement, and cooperate in the defense at the indemnifying party's reasonable expense.

11. Limitation of Liability
EXCEPT FOR EXCLUDED CLAIMS, AND TO THE MAXIMUM EXTENT PERMITTED BY LAW:
NEITHER PARTY NOR ITS AFFILIATES WILL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, OR PUNITIVE DAMAGES; AND
EACH PARTY'S AGGREGATE LIABILITY UNDER THIS AGREEMENT WILL NOT EXCEED THE AMOUNTS PAID OR PAYABLE BY CUSTOMER FOR THE SERVICE DURING THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM (THE "GENERAL LIABILITY CAP").

For Data Protection Claims, each party's aggregate liability will not exceed the greater of:
two times (2x) the General Liability Cap; or
two hundred fifty thousand U.S. dollars (US$250,000).

12. Subscription Term; Termination
12.1 Term
This Agreement is effective as of the Effective Date and remains in effect until terminated in accordance with its terms.

12.2 Termination for Cause
Either party may terminate this Agreement upon written notice if the other party materially breaches this Agreement and fails to cure such breach within thirty (30) days after written notice.

12.3 Effect of Termination
Upon termination of this Agreement:
Provider will delete or anonymize Customer Data stored in the Service; and
Customer shall promptly discontinue all use of the Service and pay all undisputed amounts due.

13. General Provisions
13.1 Governing Law
This Agreement will be governed by and construed in accordance with the laws of the State of New York and the United States, without regard to conflict-of-law principles.

13.5 Assignment
Neither party may assign this Agreement without the prior written consent of the other party, except in connection with a merger, acquisition, corporate reorganization, or sale of all or substantially all of its assets or voting securities.

13.6 Force Majeure
Neither party will be liable for any delay or failure to perform its obligations due to causes beyond its reasonable control.

13.7 Entire Agreement
This Agreement, together with the applicable Order Forms and any referenced exhibits or addenda, constitutes the entire agreement between the parties regarding the subject matter hereof and supersedes all prior or contemporaneous agreements.

14. Definitions
"Affiliate" means any entity that directly or indirectly controls, is controlled by, or is under common control with a party.
"Confidential Information" means non-public information disclosed by one party to the other that is designated as confidential or that reasonably should be understood to be confidential.
"Customer Data" means any data, content, or materials submitted by or on behalf of Customer or its Users to the Service.
"Documentation" means Provider's technical documentation and usage guides for the Service.
"Input" means any natural language statement, prompt, query, or other request a User provides to the Service.
"Output" means any AI-generated content or other result produced by the Service in response to Input.
"Service" means Provider's hosted software-as-a-service offerings identified in the applicable Order Form.
"Subscription Term" means the period during which Customer is permitted to access and use the Service.
"Users" means individuals authorized by or on behalf of Customer to access and use the Service.

15. Signatures
IN WITNESS WHEREOF, the parties' authorized representatives have executed this Agreement as of the Effective Date.

Example AI Services, Inc. ("Provider")
Signature: ___________________________
Name: _______________________________
Title: ________________________________
Date: ________________________________

Customer
Signature: ___________________________
Name: _______________________________
Title: ________________________________
Date: ________________________________`;

export const TEST_PLAYBOOK = `Sample Terms of Service Playbook
This document is a sample playbook to illustrate how an internal legal team might guide negotiations on a standard software-as-a-service Terms of Service ("TOS") between a generic Vendor and Customer. It is intended purely as sample content for testing redlining and review workflows and does not constitute legal advice.

Where the playbook refers to "Vendor," "Service," "Order Form," etc., these are generic placeholders and not tied to any specific company or product.


PREAMBLE
Language (Sample Clause)
This Terms of Service agreement ("Agreement") is entered into as of the date last signed below ("Effective Date") by and between Vendor, and the entity identified in the signature block below ("Customer").

This Agreement includes and incorporates any exhibits referenced in this Agreement, any Order Forms, data protection addenda, business associate addenda (as applicable), or other agreements related to the Service and executed by the parties. Vendor and Customer may be referred to individually as a "party" and collectively as the "parties."

Issue A: Customer Wants to Use Their Paper (Customer-Drafted TOS)
Guidance
The Vendor-standard TOS is drafted to match the Service architecture (hosted SaaS, optional customer-hosted deployment, optional AI/ML components, etc.).
Reversing the Vendor-standard TOS onto a customer's generic paper is usually more time-consuming and increases the risk of gaps or contradictions.
Preferred approach:
Use Vendor's TOS as the base.
Customer proposes targeted redlines where they have specific concerns.
If the customer insists on their paper, evaluate:
Whether their form accounts for cloud hosting, third-party components, and data processing in a way that is compatible with the Service.
Whether key Vendor protections (IP ownership, limitations of liability, data protection framework, etc.) can be preserved without extensive re-drafting.

Fallback Language (Customer Cover Email / Talk Track)
Because our service and deployment model have some unique characteristics, our standard Terms of Service are designed specifically around how the platform is delivered, hosted, and supported. Reverse-engineering your form to fit those requirements typically increases review time for both sides and still leaves gaps to negotiate.
Our strong preference is to use our TOS as the base and work through any specific changes you'd like to propose by redline.


SECTION 1: SERVICE ACCESS AND CONFIGURATIONS
1.1 Access
Language (Sample Clause)
Subject to the terms of this Agreement, Customer and its authorized users ("Users") may access and use the Service during the Subscription Term in accordance with the applicable Order Form and documentation.
Customer may permit its Affiliates (and any third party authorized by Customer to administer the Service on Customer's behalf) to act as Users, provided that any such use is solely for the benefit of Customer. Customer is responsible for each User's compliance with this Agreement and for maintaining the confidentiality of User credentials.

Issue A: Customer Wants Broader Rights for Affiliates / Third Parties
Guidance
Broad affiliate usage can be acceptable if:
The economic model (pricing) assumes or tolerates affiliate usage; and
Either:
Customer remains responsible for all affiliate activity under a single cap; or
Each affiliate signs its own Order Form and is directly liable to Vendor.
Avoid language that makes every affiliate a full "Customer" party to the Agreement without a direct commercial relationship.

Fallback
It is acceptable to expand the definition of "Users" and "Affiliates" so long as (i) Customer remains fully responsible for such Affiliates' use of the Service, and/or (ii) any Affiliate that contracts directly for the Service signs its own Order Form governed by this Agreement.


1.2 Hosting Options
Language (Sample Clause)
Customer may deploy the Service using one of the following hosting options:
Deployment in Customer's cloud service provider account; or
Deployment in Vendor's cloud service provider account.
If deployed in Vendor's account, Customer may select from supported cloud providers and supported hosting regions as listed in Vendor's documentation.

Issue A: Customer Requests "US-Only" Hosting
Guidance
For Vendor-hosted deployments:
It is usually acceptable to commit that production data will be stored in a specific region (e.g., United States), if the Vendor's platform supports it.
For Customer-hosted deployments:
Customer controls region selection through their own cloud configuration.
Vendor should not make representations about where Customer chooses to host.

Fallback Language
If Customer selects Vendor-hosted deployment, Customer may designate a supported hosting region (including a United States region). Vendor will store Customer production data for that deployment in the designated region, subject to standard redundancy and backup practices.


1.3 Use of Third-Party Components (e.g., AI/ML Models)
Language (Sample Clause)
For any Service functionality that utilizes third-party components (such as large language models or search engines), Customer may select from supported providers as listed in the documentation. Any underlying license for such third-party components is between Customer and the applicable third-party provider, and Vendor is not a party to that license.

Issue A: Customer Wants Vendor to Be Fully Responsible for Third-Party Components
Guidance
Where the license is directly between Customer and a third-party provider, Vendor:
Cannot give warranties, performance guarantees, or security commitments on that provider's behalf.
Should not accept direct liability for the third party's product or output.
Acceptable compromise:
Vendor is responsible for the integration and for the Service functioning as described.
Third-party terms govern the underlying technology and output.

Fallback Talk Track
We're happy to be responsible for our platform and the integration into the third-party services we support. Since the underlying model/service is licensed directly between you and the third-party provider, they remain responsible for their product and its output, and their specific contract terms apply there.


SECTION 2: RESTRICTIONS
Language (Sample Clause)
Customer will not (and will not permit any third party to):
provide the Service to third parties as a hosted or managed service;
reverse engineer, decompile, or disassemble the Service, except to the limited extent expressly permitted by applicable law;
remove or obscure any proprietary notices in the Service;
use the Service in violation of applicable law; or
use the Service to benchmark or build a competing product or service.

Issue A: Customer Strikes "No Benchmarking / No Competitive Use"
Guidance
This is a standard SaaS restriction to prevent:
Formal benchmarking publications against competitors;
Using access to the Service to design or train a direct competitor.
If customer is resistant:
Explore whether they have a regulatory or internal policy basis for the ask.
Consider a narrow carve-out for internal evaluation, not public benchmarking.

Possible Narrowing
Customer may conduct internal performance testing for its own evaluation purposes, but will not publish or disclose comparative benchmark results that identify Vendor or the Service without Vendor's prior written consent.


SECTION 3: CUSTOMER DATA
3.1 Rights in Customer Data
Language (Sample Clause)
As between the parties, Customer and its licensors retain all right, title, and interest in and to Customer Data and any modifications made thereto in the course of operation of the Service. Subject to this Agreement, Customer grants Vendor a non-exclusive, worldwide, royalty-free license during the Subscription Term to process Customer Data solely:
to provide, operate, and support the Service; and
to prevent or address technical or security issues.

Issue A: Customer Attempts to Remove Vendor's Right to Process Data for Support / Operations
Guidance
Vendor must retain minimal rights to:
Store, copy, and process Customer Data as technically necessary to provide the Service.
Investigate and remediate incidents (e.g., operational or security issues).
If Customer wants to add comfort language, focus on:
Narrow purpose limitation;
No secondary use (e.g., training unrelated models, reselling data, etc.) without consent.

Fallback Language
Vendor will not use Customer Data for any purpose other than providing and supporting the Service, preventing or addressing technical or security issues, or as required by law.


3.2 Customer Obligations
Language (Sample Clause)
Customer is solely responsible for the accuracy, content, and legality of Customer Data. Customer represents and warrants that it has all rights and consents necessary for Vendor to process Customer Data in accordance with this Agreement and that such processing will not violate applicable law or the rights of any third party.

Issue B: Customer Tries to Make These Obligations Mutual
Guidance
Vendor does not control:
What Customer uploads;
Industry-specific laws that apply to Customer's data content.
It is therefore appropriate for these commitments to sit primarily with Customer.
If Customer insists on mutuality:
Limit Vendor's reciprocal language to data it uploads or provides.


SECTION 8: WARRANTIES AND DISCLAIMERS
8.1 Service Warranty
Language (Sample Clause)
Vendor warrants that the Service will operate in all material respects as described in the applicable documentation during the Subscription Term. In the event of a verified non-conformity, Vendor will use commercially reasonable efforts to correct the issue at no additional charge, or, if Vendor determines such remedy is not commercially feasible, Customer may terminate the affected Order Form and receive a prorated refund of prepaid, unused Fees for the remainder of the Subscription Term.

Issue A: Customer Requests Additional, Very Broad Warranties
Guidance
Avoid absolute guarantees about:
Zero defects or downtime;
Compliance with Customer-specific legal regimes that Vendor cannot feasibly track.
Acceptable enhancements:
Limited warranties about malicious code (to the best of Vendor's knowledge at delivery).
Specific, tightly-scoped additional warranties where risk is understood and priced.


8.3 Warranty Disclaimer
Language (Sample Clause)
EXCEPT FOR THE EXPRESS WARRANTIES SET OUT IN THIS AGREEMENT, THE SERVICE AND ANY OUTPUT ARE PROVIDED "AS IS" AND "AS AVAILABLE," AND VENDOR DISCLAIMS ALL OTHER WARRANTIES, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. VENDOR DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED OR ERROR-FREE.

Issue B: Customer Strikes "Non-Infringement" From the Disclaimer
Guidance
Vendor already provides an IP infringement indemnity (see Section 9 sample) as the primary protection for IP claims.
Adding a separate, broad non-infringement warranty can overlap or conflict with that indemnity.
If Customer has strong concerns:
Emphasize the indemnity as the intended remedy.
As a last resort, it may be acceptable to remove "non-infringement" from the disclaimer, without adding a separate broad warranty.


SECTION 11: LIMITATION OF LIABILITY
11.1 Cap on Liability
Language (Sample Clause)
Except for excluded categories of claims, each party's aggregate liability arising out of or related to this Agreement will not exceed the total Fees paid or payable by Customer to Vendor under the applicable Order Form during the twelve (12) months immediately preceding the event giving rise to the claim.

Issue A: Customer Requests Uncapped Liability
Guidance
Uncapped liability is not commercially sustainable for SaaS providers.
Caps should:
Scale with commercial value (e.g., 12-month Fee look-back);
Optionally include a higher cap (e.g., 2x) for specific "data protection" claims, if the business accepts that exposure.
If Customer resists:
Explain that cyber / E&O insurance and internal risk policies are calibrated to capped exposure.


11.2 Exclusion of Certain Damages
Language (Sample Clause)
Neither party will be liable for any indirect, incidental, consequential, special, exemplary, or punitive damages, or for any loss of profits, revenue, or business interruption, even if advised of the possibility of such damages or if such damages were foreseeable.

Issue B: Customer Wants to Carve Out Certain Categories (e.g., Regulatory Fines) From the Exclusion
Guidance
Consider whether those categories are already addressed within:
A data protection super-cap; or
Insurance maintained by each party.
Resist broad carve-outs that:
Re-introduce consequential damages under a different label; or
Functionally undo the cap.


HOW TO USE THIS PLAYBOOK FOR REDLINING DEMOS
Treat the "Language" blocks as the starting contract text.
Treat "Issue" and "Guidance" as:
Internal commentary on customer asks; and
Rationales the review tool can reference when suggesting accept / reject / modify.
Treat "Fallback" or "Possible Narrowing" sections as:
Example alternative text that can be automatically proposed when Customer redlines the base clause.

This structure is intentionally simplified and generalized to support testing and demonstration of contract redlining and review flows with external users, without referencing any specific vendor, customer, or confidential internal standard.`;
