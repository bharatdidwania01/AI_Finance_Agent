/* Guided-setup questions. Data only: app.js renders these, engine.js reads the answers.
   Field types: text | count | amount | choice. `per` labels amounts as monthly or yearly. */
(function (root) {
  "use strict";

  var STEPS = [
    {
      id: "about", title: "About you", intro: "A few basics so the numbers make sense for your stage of life.",
      fields: [
        { key: "name", label: "Your full name", type: "text", required: true, placeholder: "e.g. Sunita Sharma" },
        { key: "age", label: "Your age", type: "count", required: true, min: 18, max: 100 },
        { key: "city", label: "City you live in", type: "text", placeholder: "e.g. Jaipur" },
        { key: "occupation", label: "What do you do?", type: "choice",
          options: ["Salaried", "Business owner", "Self-employed professional", "Retired", "Homemaker", "Other"] },
        { key: "spouseDependent", label: "Does your spouse depend on your income?", type: "choice",
          options: [["yes", "Yes"], ["no", "No"], ["na", "Not married"]] },
        { key: "children", label: "Children who depend on you", type: "count", min: 0, max: 10 },
        { key: "parents", label: "Parents who depend on you", type: "count", min: 0, max: 4 },
        { key: "regime", label: "Income tax regime you file under", type: "choice",
          options: [["New", "New regime"], ["Old", "Old regime"], ["NotSure", "Not sure"]],
          hint: "If you are not sure, we assume the new regime, which is the default." }
      ]
    },
    {
      id: "income", title: "Money coming in", intro: "Enter what reaches your bank account. Leave anything that does not apply blank.",
      fields: [
        { key: "salary", label: "Salary, in hand", type: "amount", per: "month" },
        { key: "business", label: "Business or professional income", type: "amount", per: "month" },
        { key: "rental", label: "Rent you receive", type: "amount", per: "month" },
        { key: "pension", label: "Pension", type: "amount", per: "month" },
        { key: "interest", label: "Interest and dividends", type: "amount", per: "month", hint: "A rough monthly average is fine." },
        { key: "other", label: "Any other regular income", type: "amount", per: "month" },
        { key: "bonus", label: "Yearly bonus or incentive", type: "amount", per: "year" },
        { key: "annualGross", label: "Total yearly income before tax", type: "amount", per: "year",
          hint: "From Form 16 or your ITR. Used only to estimate your tax bracket. Leave blank if unsure." }
      ]
    },
    {
      id: "spending", title: "Money going out", intro: "Rough monthly amounts are fine; your bank or UPI app history helps. Do not include loan EMIs here; we ask about loans later.",
      groups: [
        { title: "Needs", fields: [] },
        { title: "Wants", fields: [] },
        { title: "Yearly and investments", fields: [
          { key: "premiums", label: "Insurance premiums", type: "amount", per: "year", hint: "Health, term and LIC premiums together." },
          { key: "sip", label: "SIPs, RDs or other monthly investments", type: "amount", per: "month" } ] }
      ]
    },
    {
      id: "assets", title: "What you own", intro: "Today's approximate value of each. Blank means you don't have it.",
      groups: [
        { title: "Bank", fields: [
          { key: "savings", label: "Savings and current account balance", type: "amount" },
          { key: "fd", label: "Fixed deposits and RDs", type: "amount" } ] },
        { title: "Investments", fields: [
          { key: "equityMf", label: "Equity mutual funds", type: "amount", hint: "Current value from your app or CAS statement." },
          { key: "debtMf", label: "Debt or liquid mutual funds", type: "amount" },
          { key: "stocks", label: "Shares in a demat account", type: "amount" } ] },
        { title: "Retirement", fields: [
          { key: "epf", label: "EPF / VPF balance", type: "amount", hint: "Check the EPFO passbook or UMANG app." },
          { key: "ppf", label: "PPF balance", type: "amount" },
          { key: "nps", label: "NPS balance", type: "amount" } ] },
        { title: "Gold", fields: [
          { key: "gold", label: "Gold jewellery and coins", type: "amount", hint: "Grams you own times today's gold rate per gram." },
          { key: "sgb", label: "Sovereign Gold Bonds or gold funds", type: "amount" } ] },
        { title: "Property", fields: [
          { key: "home", label: "Home you live in", type: "amount" },
          { key: "property", label: "Other property or land", type: "amount" } ] },
        { title: "Other", fields: [
          { key: "smallSavings", label: "Post office schemes (NSC, KVP, SCSS, Sukanya)", type: "amount" },
          { key: "other", label: "Anything else of value", type: "amount", hint: "Business stake, ESOPs, money lent to others." } ] }
      ]
    },
    {
      id: "loans", title: "What you owe", intro: "Add each loan or credit card balance. If you have none, choose \"I have no loans\".",
      list: { key: "loans", noneLabel: "I have no loans", addLabel: "Add a loan", itemTitle: "Loan",
        fields: [
          { key: "type", label: "Type of loan", type: "choice",
            options: ["Home", "Car", "Personal", "Education", "Gold", "Against property", "Business", "Credit card", "Other"] },
          { key: "outstanding", label: "Amount still to repay", type: "amount" },
          { key: "emi", label: "EMI", type: "amount", per: "month" },
          { key: "rate", label: "Interest rate (% a year)", type: "count", min: 0, max: 60, step: "0.1" },
          { key: "rateType", label: "Is the interest rate fixed or floating?", type: "choice", options: ["Floating", "Fixed", "Not sure"],
            hint: "Floating-rate loans to individuals sanctioned from 1 Jan 2026 carry no prepayment charges (RBI)." },
          { key: "inRepayment", label: "Have EMIs started?", type: "choice", options: [["yes", "Yes, paying EMIs"], ["no", "Not yet (moratorium)"]],
            hint: "Education loans often have a study-period moratorium while interest keeps adding up." },
          { key: "yearsLeft", label: "Years left", type: "count", min: 0, max: 40 }
        ] }
    },
    {
      id: "insurance", title: "Insurance", intro: "The amount you are covered for, not the premium.",
      fields: [
        { key: "term", label: "Term life insurance cover", type: "amount" },
        { key: "otherLife", label: "Other life cover (LIC, endowment, ULIP)", type: "amount" },
        { key: "health", label: "Health insurance you bought yourself", type: "amount", hint: "Family floater cover amount." },
        { key: "employerHealth", label: "Health cover from your employer", type: "amount" }
      ]
    },
    {
      id: "goals", title: "Your goals", intro: "What are you saving for? Enter the cost in today's money; we adjust for inflation.",
      list: { key: "goals", noneLabel: "Skip goals for now", addLabel: "Add a goal", itemTitle: "Goal",
        fields: [
          { key: "type", label: "Goal", type: "choice",
            options: ["Retirement", "Child's education", "Child's wedding", "Buy a home", "Buy a car", "Travel", "Other"] },
          { key: "name", label: "Short name (optional)", type: "text", placeholder: "e.g. Riya's engineering" },
          { key: "amount", label: "Cost in today's money", type: "amount" },
          { key: "years", label: "Years from now", type: "count", min: 1, max: 50 },
          { key: "saved", label: "Already set aside for it", type: "amount" }
        ] }
    },
    {
      id: "risk", title: "How you feel about risk", intro: "Two quick questions. There are no wrong answers.",
      fields: [
        { key: "drop", label: "Your ₹10 lakh investment falls to ₹8 lakh in a bad year. What would you do?", type: "choice",
          options: [["sell", "Sell to stop further loss"], ["wait", "Wait for it to recover"], ["buy", "Invest more while prices are low"]] },
        { key: "horizon", label: "When will you need most of your invested money?", type: "choice",
          options: [["short", "Within 3 years"], ["medium", "In 3 to 7 years"], ["long", "After 7 years or more"]] }
      ]
    }
  ];

  // Spending categories come from the engine so setup, check-ins and analysis always match.
  var spendStep = STEPS.find(function (s) { return s.id === "spending"; });
  ["need", "want"].forEach(function (kind, i) {
    spendStep.groups[i].fields = Engine.SPEND_CATS.filter(function (c) { return c.kind === kind; }).map(function (c) {
      return { key: c.key, label: c.label, type: "amount", per: "month", hint: c.hint };
    });
  });

  function fieldsOf(step) {
    if (step.fields) return step.fields;
    if (step.groups) return step.groups.reduce(function (a, g) { return a.concat(g.fields); }, []);
    return [];
  }

  root.Questions = { STEPS: STEPS, fieldsOf: fieldsOf };
})(typeof window !== "undefined" ? window : this);
