// Biome and theme palettes for procedural pixel art.
export const BIOME_PAL = [
  { // forest
    g: ['#5b9a3e', '#538f38', '#64a646'], dark: '#3f7230', tall: '#478a32',
    path: ['#b89a68', '#a88a5a', '#c8aa78'], cliff: ['#8a7458', '#6e5a42', '#4e3f2e'], rim: '#a08a68',
    tree: ['#2e6b2e', '#3d8a3a', '#56a24a'], trunk: '#5a3d22', water: ['#3a7ac8', '#4a8ad8', '#9ccaf2'],
    flower: ['#f0e060', '#f08080', '#ffffff', '#a0a0ff'],
  },
  { // swamp
    g: ['#6a7f48', '#617544', '#728a50'], dark: '#4a5a34', tall: '#5a6e3e', mud: ['#5e5236', '#544a30', '#685c3e'],
    path: ['#8a7a58', '#7a6a4a', '#9a8a68'], cliff: ['#6a6048', '#524a38', '#3a3428'], rim: '#7a7058',
    tree: ['#34522e', '#44663a', '#587a46'], trunk: '#4a3a28', water: ['#3f6a66', '#4a7a72', '#8ab8a8'],
    flower: ['#d0e070', '#e0a0c0', '#ffffff', '#b0d0ff'],
  },
  { // desert
    g: ['#dcbc70', '#d2b064', '#e4c87c'], dark: '#b8984e', tall: '#c8a860', oasis: ['#7aa848', '#6e9a40', '#86b450'],
    path: ['#c8a064', '#b89058', '#d4b070'], cliff: ['#c08850', '#a06c3c', '#7a4e2a'], rim: '#d09a60',
    tree: ['#3e7a34', '#4e8e40', '#62a24e'], trunk: '#7a5a32', water: ['#3a8ac0', '#4a9ad0', '#a8daf0'],
    flower: ['#ff9050', '#f0d060', '#ffffff', '#e070a0'],
  },
  { // mountain
    g: ['#6e8c58', '#668250', '#789660'], dark: '#50683e', tall: '#5e7a4a',
    path: ['#a09078', '#90806a', '#b0a088'], cliff: ['#8e8e90', '#6e6e72', '#4a4a50'], rim: '#a4a4a6',
    tree: ['#2c5a3c', '#3a6e48', '#4e8458'], trunk: '#4e3a28', water: ['#4a7ab0', '#5a8ac0', '#a0c8e8'],
    flower: ['#e0e0f0', '#c0a0e0', '#ffffff', '#f0f0a0'],
  },
  { // snow
    g: ['#e8eef4', '#dde6ee', '#f4f8fb'], dark: '#c4d0dc', tall: '#d0dae4',
    path: ['#b8c0c8', '#a8b0ba', '#c8d0d8'], cliff: ['#a8b4c4', '#8494a8', '#5e6e84'], rim: '#c4ceda',
    tree: ['#2c5a4c', '#3a6e5a', '#eef4fa'], trunk: '#4a3a30', water: ['#6a9ac8', '#7aaad8', '#c8e4f8'],
    flower: ['#a8d8f8', '#ffffff', '#d0e8ff', '#f0f0ff'],
  },
  { // volcanic
    g: ['#4a4242', '#433b3b', '#524848'], dark: '#352e2e', tall: '#463c3c',
    path: ['#6a5a50', '#5e4e46', '#76665a'], cliff: ['#3e3232', '#2e2424', '#1c1414'], rim: '#5a4a46',
    tree: ['#2a2222', '#3a2e2a', '#4a3c36'], trunk: '#2a2020', water: ['#e8641e', '#ff9a3a', '#ffd070'],
    flower: ['#ff7030', '#ffb040', '#ff5020', '#ffd060'],
  },
];

export const THEMES = {
  verdant: { floor: ['#4c5e3c', '#45573a', '#546644'], wall: ['#5a6e48', '#3a4a32', '#26321f'], accent: '#8ac850', glow: 'rgba(140,220,90,0.25)', pit: '#141a10' },
  ashen: { floor: ['#4e3c36', '#46352f', '#56423b'], wall: ['#5a463e', '#33272a', '#1e1618'], accent: '#ff7a30', glow: 'rgba(255,120,40,0.25)', pit: '#100808' },
  frost: { floor: ['#9db2c6', '#93a8bc', '#a8bcd0'], wall: ['#8aa0b8', '#5a7088', '#3a4a5e'], accent: '#b8ecff', glow: 'rgba(170,230,255,0.28)', pit: '#1a2230' },
  drowned: { floor: ['#46564c', '#3e4d44', '#506256'], wall: ['#4e6a62', '#2e423e', '#1a2826'], accent: '#5adcc8', glow: 'rgba(90,220,200,0.25)', pit: '#0c1614', water: '#26524e' },
  interior: { floor: ['#a07850', '#94704a', '#ac8458'], wall: ['#c8b08a', '#7a5a3e', '#4a3424'], accent: '#e0c080', glow: 'rgba(255,220,150,0.2)', pit: '#000' },
};

export const CAVE_THEMES = [
  { floor: ['#4a4436', '#433d30', '#524c3c'], wall: ['#6a5e4a', '#463e30', '#2a2420'], accent: '#a0c070' },
  { floor: ['#3e463a', '#384034', '#465042'], wall: ['#566050', '#384034', '#22281e'], accent: '#80c0a0' },
  { floor: ['#6a5640', '#604e3a', '#745e46'], wall: ['#8a6e4e', '#5e4a34', '#3a2c1e'], accent: '#f0c060' },
  { floor: ['#4a4a50', '#424248', '#525258'], wall: ['#6a6a72', '#46464e', '#2a2a30'], accent: '#c0c0ff' },
  { floor: ['#7a8a9a', '#708090', '#8494a4'], wall: ['#90a0b4', '#5e6e84', '#3a4658'], accent: '#c0f0ff' },
  { floor: ['#3e3030', '#362a2a', '#463636'], wall: ['#4e3c38', '#2e2222', '#1a1212'], accent: '#ff8040' },
];

export const UI = {
  text: '#f4ead8', dim: '#b8a888', gold: '#f0c850', panel: 'rgba(20,16,24,0.88)', panelEdge: '#c8a060',
  hp: '#e04848', hpDark: '#701c1c', mana: '#4a8ae8', stamina: '#5ac85a', danger: '#ff6040',
};
