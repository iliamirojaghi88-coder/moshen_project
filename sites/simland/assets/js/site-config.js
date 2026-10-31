// Contact details of «با ما در ارتباط باشید» — the one place to edit them.
// The page is built from these values (node tools/build-pages.mjs):
//
//   phones   a card per line. `number` as it should be dialled and shown, digits
//            only (e.g. '09121234567'). An empty number shows «شماره تماس به‌زودی»
//            and the card stays inactive (no tel: link); fill it in and rebuild
//            to turn that card into a real call link like the first one.
//   address  the branch address as text. `mapUrl`: a verified map / route link;
//            while it is empty the card offers «کپی آدرس» instead of a map link.
export const contact = {
  phones: [
    { label: 'مشاوره و خرید', number: '09123520415', tone: 'blue' },
    { label: 'مشاوره و خرید', number: '', tone: 'green' },
  ],
  address: { label: 'آدرس شعبه', text: 'قم، خیابان مفتح، نبش کوچه ۶', mapUrl: '' },
};
