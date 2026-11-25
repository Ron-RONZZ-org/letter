// Minimal modern letter — A4 or US Letter
#import "../vendor/cmarker/lib.typ": render

#let f(d, k) = d.at(k, default: "")
#let nonempty(x) = if x == none { false } else { x != "" }
#let addr_lines(p) = {
  let city = (f(p, "postal_code") + " " + f(p, "city")).trim()
  (f(p, "title"), f(p, "organization"), f(p, "street"), city, f(p, "region"), f(p, "country"))
    .filter(nonempty).join(linebreak())
}
#let contact(p) = {
  (f(p, "phone"), f(p, "email"), f(p, "website")).filter(nonempty).join("  ·  ")
}

#let letter(data) = {
  set page(
    paper: if f(data, "paper") == "us-letter" { "us-letter" } else { "a4" },
    margin: (x: 2.4cm, top: 2.2cm, bottom: 2.2cm),
    numbering: none,
  )
  set text(font: "Liberation Sans", size: 10.5pt, lang: "en")
  set par(justify: false, leading: 0.72em)
  set document(title: f(data, "subject"), author: f(data.sender, "name"))

  // Letterhead
  block(width: 100%)[
    #text(size: 15pt, weight: "bold", fill: rgb("#1f3a5f"))[#f(data.sender, "name")]
    #linebreak()
    #text(size: 9pt, fill: rgb("#555555"))[#addr_lines(data.sender)]
    #if nonempty(contact(data.sender)) [#linebreak() #text(size: 9pt, fill: rgb("#555555"))[#contact(data.sender)]]
    #v(0.25cm)
    #line(length: 100%, stroke: 0.6pt + rgb("#1f3a5f"))
  ]

  v(1.2cm)

  grid(
    columns: (1fr, 1fr),
    [
      #text(size: 9.5pt)[
        #if nonempty(f(data.recipient, "name")) [#strong[#f(data.recipient, "name")] #linebreak()]
        #addr_lines(data.recipient)
      ]
    ],
    align(right)[
      #text(size: 9pt, fill: rgb("#555555"))[
        #if nonempty(f(data, "place")) [#f(data, "place") #linebreak()]
        #f(data, "date")
      ]
    ],
  )

  v(1.2cm)

  if nonempty(f(data, "subject")) [
    #text(size: 12pt, weight: "bold")[#f(data, "subject")]
    #v(0.8cm)
  ]

  if nonempty(f(data, "salutation")) [#f(data, "salutation")] else [Dear Sir or Madam,]
  v(0.6cm)

  render(f(data, "body"), raw-typst: false)

  v(1.2cm)

  if nonempty(f(data, "closing")) [#f(data, "closing")] else [Kind regards,]
  v(1.4cm)
  strong[#f(data.sender, "name")]
  if nonempty(f(data.sender, "title")) [#linebreak() #f(data.sender, "title")]
  if nonempty(f(data.sender, "organization")) [#linebreak() #f(data.sender, "organization")]

  v(1.2cm)
  if nonempty(f(data, "enclosures")) [
    #text(size: 9pt, fill: rgb("#555555"))[Enclosures: #f(data, "enclosures")]
  ]
  if nonempty(f(data, "cc")) [
    #text(size: 9pt, fill: rgb("#555555"))[cc: #f(data, "cc")]
  ]
}
