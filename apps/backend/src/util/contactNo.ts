export const isContactNo = (contactNo: string): boolean => {
    const contactNoRegex = /^[0-9]{10}$/;
    return contactNoRegex.test(contactNo);
};