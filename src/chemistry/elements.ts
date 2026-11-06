// Symbols and English names follow the IUPAC periodic table.
const names = `H Hydrogen;He Helium;Li Lithium;Be Beryllium;B Boron;C Carbon;N Nitrogen;O Oxygen;F Fluorine;Ne Neon;Na Sodium;Mg Magnesium;Al Aluminium;Si Silicon;P Phosphorus;S Sulfur;Cl Chlorine;Ar Argon;K Potassium;Ca Calcium;Sc Scandium;Ti Titanium;V Vanadium;Cr Chromium;Mn Manganese;Fe Iron;Co Cobalt;Ni Nickel;Cu Copper;Zn Zinc;Ga Gallium;Ge Germanium;As Arsenic;Se Selenium;Br Bromine;Kr Krypton;Rb Rubidium;Sr Strontium;Y Yttrium;Zr Zirconium;Nb Niobium;Mo Molybdenum;Tc Technetium;Ru Ruthenium;Rh Rhodium;Pd Palladium;Ag Silver;Cd Cadmium;In Indium;Sn Tin;Sb Antimony;Te Tellurium;I Iodine;Xe Xenon;Cs Caesium;Ba Barium;La Lanthanum;Ce Cerium;Pr Praseodymium;Nd Neodymium;Pm Promethium;Sm Samarium;Eu Europium;Gd Gadolinium;Tb Terbium;Dy Dysprosium;Ho Holmium;Er Erbium;Tm Thulium;Yb Ytterbium;Lu Lutetium;Hf Hafnium;Ta Tantalum;W Tungsten;Re Rhenium;Os Osmium;Ir Iridium;Pt Platinum;Au Gold;Hg Mercury;Tl Thallium;Pb Lead;Bi Bismuth;Po Polonium;At Astatine;Rn Radon;Fr Francium;Ra Radium;Ac Actinium;Th Thorium;Pa Protactinium;U Uranium;Np Neptunium;Pu Plutonium;Am Americium;Cm Curium;Bk Berkelium;Cf Californium;Es Einsteinium;Fm Fermium;Md Mendelevium;No Nobelium;Lr Lawrencium;Rf Rutherfordium;Db Dubnium;Sg Seaborgium;Bh Bohrium;Hs Hassium;Mt Meitnerium;Ds Darmstadtium;Rg Roentgenium;Cn Copernicium;Nh Nihonium;Fl Flerovium;Mc Moscovium;Lv Livermorium;Ts Tennessine;Og Oganesson`;
const rows = [
  "H . . . . . . . . . . . . . . . . He",
  "Li Be . . . . . . . . . . B C N O F Ne",
  "Na Mg . . . . . . . . . . Al Si P S Cl Ar",
  "K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr",
  "Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe",
  "Cs Ba . Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn",
  "Fr Ra . Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og",
  ". . La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu .",
  ". . Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr .",
];
export type Category =
  "nonmetal" | "noble" | "metal" | "transition" | "metalloid" | "inner";
export interface Element {
  number: number;
  symbol: string;
  name: string;
  row: number;
  column: number;
  category: Category;
}
export const elements: Element[] = names.split(";").map((entry, index) => {
  const [symbol, name] = entry.split(" ");
  const row = rows.findIndex((r) => r.split(" ").includes(symbol));
  const column = rows[row].split(" ").indexOf(symbol);
  const category: Category =
    row >= 7
      ? "inner"
      : column === 17
        ? "noble"
        : ["B", "Si", "Ge", "As", "Sb", "Te"].includes(symbol)
          ? "metalloid"
          : [
                "H",
                "C",
                "N",
                "O",
                "P",
                "S",
                "Se",
                "F",
                "Cl",
                "Br",
                "I",
                "At",
                "Ts",
              ].includes(symbol)
            ? "nonmetal"
            : column >= 2 && column <= 11
              ? "transition"
              : "metal";
  return {
    number: index + 1,
    symbol,
    name,
    row: row + 1,
    column: column + 1,
    category,
  };
});
export const elementBySymbol = new Map(elements.map((e) => [e.symbol, e]));
