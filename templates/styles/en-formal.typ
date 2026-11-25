// English formal letter — A4 or US Letter
#import "../vendor/cmarker/lib.typ": render

#let f(d, k) = d.at(k, default: "")
#let nonempty(x) = if x == none { false } else { x != "" }
#let addr_lines(p) = {
  let city = (f(p, "postal_code") + " " + f(p, "city")).trim()
  let region = f(p, "region")
  let city_line = if nonempty(region) { city + ", " + region } else { city }
  (f(p, "title"), f(p, "organization"), f(p, "street"), city_line, f(p, "country"))
    .filter(nonempty).join(linebreak())
}
#let contact(p) = {
  (f(p, "phone"), f(p, "email"), f(p, "website")).filter(nonempty).join(" · ")
}

#let letter(data) = {
  set page(
    paper: if f(data, "paper") == "us-letter" { "us-letter" } else { "a4" },
    margin: (x: 2.4cm, top: 2.2cm, bottom: 2.2cm),
    numbering: none,
  )
  set text(font: "Liberation Serif", size: 11pt, lang: "en")
  set par(justify: true, leading: 0.68em)
  set document(title: f(data, "subject"), author: f(data.sender, "name"))

  // Sender (top right)
  align(right)[
    #text(size: 9.5pt)[
      #strong[#f(data.sender, "name")]
      #linebreak()
      #addr_lines(data.sender)
      #if nonempty(contact(data.sender)) [#linebreak() #contact(data.sender)]
    ]
  ]

  v(1.4cm)

  // Recipient (left) and date (right)
  grid(
    columns: (1fr, 1fr),
    [
      #text(size: 9.5pt)[
        #if nonempty(f(data.recipient, "name")) [#strong[#f(data.recipient, "name")] #linebreak()]
        #addr_lines(data.recipient)
      ]
    ],
    align(right)[
      #text(size: 9.5pt)[#f(data, "date")]
    ],
  )

  v(1.2cm)

  if nonempty(f(data, "your_ref")) or nonempty(f(data, "our_ref")) or nonempty(f(data, "reference")) [
    #text(size: 9pt)[
      #if nonempty(f(data, "your_ref")) [Your ref: #f(data, "your_ref") #linebreak()]
      #if nonempty(f(data, "our_ref")) [Our ref: #f(data, "our_ref") #linebreak()]
      #if nonempty(f(data, "reference")) [Ref: #f(data, "reference")]
    ]
    #v(0.8cm)
  ]

  if nonempty(f(data, "subject")) [
    #strong[Re: #f(data, "subject")]
    #v(0.8cm)
  ]

  if nonempty(f(data, "salutation")) [#f(data, "salutation")] else [Dear Sir or Madam,]
  v(0.6cm)

  render(f(data, "body"), raw-typst: false)

  v(1.2cm)

  if nonempty(f(data, "closing")) [#f(data, "closing")] else [Yours faithfully,]
  v(1.4cm)
  strong[#f(data.sender, "name")]
  if nonempty(f(data.sender, "title")) [#linebreak() #f(data.sender, "title")]
  if nonempty(f(data.sender, "organization")) [#linebreak() #f(data.sender, "organization")]

  v(1.2cm)
  if nonempty(f(data, "enclosures")) [
    #text(size: 9pt)[Enclosures: #f(data, "enclosures")]
  ]
  if nonempty(f(data, "cc")) [
    #text(size: 9pt)[cc: #f(data, "cc")]
  ]
}
