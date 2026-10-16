import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner';
import { loginUser, getProducts } from './api.js';
import { saveAuth, getAuth, clearAuth } from './auth.js';

// Session data returned by the login API.
let categories = [];
let accessToken = null;
let refreshToken = null;
let currentUser = null;

// Original demo product data.
// This remains static until a products API is available.
/*const products = {
    'ABC-abc-1234': {
        name: 'Pampers Diapers Pack (M)',
        category: 'babycare',
        subCategory: 'diapers',
        price: 599,
        stock: 40,
    },
    '1234567890': {
        name: 'Philips Avent Feeding Bottle',
        category: 'babycare',
        subCategory: 'feeding',
        price: 349,
        stock: 22,
    },
    'ABC-1234': {
        name: 'FS Mini Klub Boys T-Shirt',
        category: 'clothing',
        subCategory: 'boyswear',
        price: 449,
        stock: 15,
    },
    'XYZ-9999': {
        name: 'Girls Frock - Floral Print',
        category: 'clothing',
        subCategory: 'girlswear',
        price: 799,
        stock: 12,
    },
    'TOY-1010': {
        name: 'Soft Teddy Bear - 2ft',
        category: 'toys',
        subCategory: 'softtoys',
        price: 999,
        stock: 8,
    },
};*/

// Products loaded from the backend API.
let products = [];

// HTML elements.
const loginScreen = document.querySelector('#login-screen');
const usernameInput = document.querySelector('#username');
const passwordInput = document.querySelector('#password');
const loginError = document.querySelector('#login-error');
const loginButton = document.querySelector('#login-button');

const selectionScreen = document.querySelector('#selection-screen');
const loggedInUsername = document.querySelector('#logged-in-username');
const logoutButton = document.querySelector('#logout-button');
const categorySelect = document.querySelector('#category');
const subCategorySelect = document.querySelector('#sub-category');
const startScanButton = document.querySelector('#start-scan-button');

const scanningScreen = document.querySelector('#scanning-screen');
const backButton = document.querySelector('#back-button');
const selectedCategory = document.querySelector('#selected-category');
const selectedSubCategory = document.querySelector('#selected-subcategory');
const inventoryUploadedAt = document.querySelector('#inventory-uploaded-at');
const totalScannedCount = document.querySelector('#total-scanned-count');

const scanButton = document.querySelector('#scan-barcode');
const barcodeResult = document.querySelector('#barcode-result');
const productDetails = document.querySelector('#product-details');
const nextButton = document.querySelector('#next-button');
const finishButton = document.querySelector('#finish-button');
const summary = document.querySelector('#summary');

// Scan counters.
let totalScanned = 0;
let matchedProducts = 0;
let mismatchedProducts = 0;

// Validate required HTML elements.
const requiredElements = [
    loginScreen,
    usernameInput,
    passwordInput,
    loginError,
    loginButton,
    selectionScreen,
    loggedInUsername,
    logoutButton,
    categorySelect,
    subCategorySelect,
    startScanButton,
    scanningScreen,
    backButton,
    selectedCategory,
    selectedSubCategory,
    inventoryUploadedAt,
    totalScannedCount,
    scanButton,
    barcodeResult,
    productDetails,
    nextButton,
    finishButton,
    summary,
];

// if (requiredElements.some((element) => !element)) {
//     throw new Error(
//         'Some required HTML elements are missing. Check index.html.'
//     );
// }

// Find a category using its ID.
function findCategory(categoryId) {
    return categories.find(
        (category) => String(category.id) === String(categoryId)
    );
}

// Find a subcategory using its ID.
function findSubcategory(category, subcategoryId) {
    return category?.subcategories?.find(
        (subcategory) =>
            String(subcategory.id) === String(subcategoryId)
    );
}

// Display the correct screen.
function showScreen(screenToShow) {
    loginScreen.classList.toggle(
        'hidden',
        screenToShow !== loginScreen
    );

    selectionScreen.classList.toggle(
        'hidden',
        screenToShow !== selectionScreen
    );

    scanningScreen.classList.toggle(
        'hidden',
        screenToShow !== scanningScreen
    );
}

// Populate the category dropdown using API data.
function populateCategories() {
    categorySelect.innerHTML =
        '<option value="">Select Category</option>';

    categories.forEach((category) => {
        const option = document.createElement('option');

        option.value = String(category.id);
        option.textContent = category.name;

        categorySelect.appendChild(option);
    });
}

// Reset category and subcategory selection.
function resetSelection() {
    categorySelect.value = '';

    subCategorySelect.innerHTML =
        '<option value="">Select Sub-category</option>';

    subCategorySelect.disabled = true;
    startScanButton.disabled = true;
}

// Reset scanning data and counters.
function resetScan() {
    totalScanned = 0;
    matchedProducts = 0;
    mismatchedProducts = 0;

    scanningScreen.querySelector('.screen-header h2').textContent =
        'Scan Product';

    totalScannedCount.textContent = '0';
    barcodeResult.innerHTML = '';
    productDetails.innerHTML = '';
    summary.innerHTML = '';

    scanButton.classList.remove('hidden');
    nextButton.classList.remove('hidden');
    finishButton.classList.remove('hidden');

    scanButton.disabled = false;
    nextButton.disabled = true;
    finishButton.disabled = true;
}

// Update subcategories when a category changes.
categorySelect.addEventListener('change', () => {
    subCategorySelect.innerHTML =
        '<option value="">Select Sub-category</option>';

    subCategorySelect.disabled = true;
    startScanButton.disabled = true;

    const category = findCategory(categorySelect.value);

    if (!category) {
        return;
    }

    const subcategories = category.subcategories ?? [];

    subcategories.forEach((subcategory) => {
        const option = document.createElement('option');

        option.value = String(subcategory.id);
        option.textContent = subcategory.name;

        subCategorySelect.appendChild(option);
    });

    // Categories without subcategories cannot be scanned yet.
    subCategorySelect.disabled = subcategories.length === 0;
});

// Enable Start Scanning when a subcategory is selected.
subCategorySelect.addEventListener('change', () => {
    startScanButton.disabled = !subCategorySelect.value;
});

// Login using the API.
loginButton.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    loginError.textContent = '';
    loginError.classList.add('hidden');

    // Validate input fields.
    if (!username || !password) {
        loginError.textContent =
            'Please enter your username and password.';
        loginError.classList.remove('hidden');
        return;
    }

    loginButton.disabled = true;

    // Attempt to log in the user.
    try {
        const data = await loginUser(username, password);

        // Save the authenticated session in local storage.
        await saveAuth(data);

        // Validate that categories are available for the account.
        // if (data.categories.length === 0) {
        //     throw new Error(
        //         'No categories are available for this account.'
        //     );
        // }

        // Store the authenticated session in memory.
        accessToken = data.access;
        refreshToken = data.refresh;
        currentUser = data.user;
        categories = data.categories;

        populateCategories();

        // Display the logged-in user's name and store name.
        loggedInUsername.textContent = [
            currentUser.name,
            currentUser.store_name,
        ].filter(Boolean).join(' - ');

        usernameInput.value = '';
        passwordInput.value = '';

        // Reset selection and scanning data before showing the selection screen.
        resetSelection();
        resetScan();
        showScreen(selectionScreen);
    } catch (error) {
        console.error('Login failed:', error);

        loginError.textContent =
            error.message || 'Unable to log in. Please try again.';

        loginError.classList.remove('hidden');
    } finally {
        loginButton.disabled = false;
    }
});

// Allow Enter to submit the login form.
[usernameInput, passwordInput].forEach((input) => {
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            loginButton.click();
        }
    });
});

// Start scanning.

startScanButton.addEventListener('click', async () => {
    const category = findCategory(categorySelect.value);

    const subcategory = findSubcategory(
        category,
        subCategorySelect.value
    );

    if (!category || !subcategory) {
        return;
    }

    if (!accessToken || !currentUser?.id || !currentUser?.store_id) {
        alert('Please log in again.');
        return;
    }

    startScanButton.disabled = true;
    startScanButton.textContent = 'Loading products...';

    try {
        products = await getProducts(
            accessToken,
            currentUser.id,
            currentUser.store_id,
            category.id,
            subcategory.id
        );

        console.log('Products loaded:', products);

        resetScan();

        selectedCategory.textContent = category.name;
        selectedSubCategory.textContent = subcategory.name;

        inventoryUploadedAt.textContent = new Date().toLocaleString(
            'en-IN',
            {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            }
        );

        showScreen(scanningScreen);
    } catch (error) {
        console.error('Unable to load products:', error);
        alert(error.message || 'Unable to load products.');
    } finally {
        startScanButton.disabled = false;
        startScanButton.textContent = 'Start Scanning';
    }
});

// Go back to category selection.
backButton.addEventListener('click', () => {
    resetScan();
    showScreen(selectionScreen);
});

// Scan a barcode and compare it with the selected category.
async function scanProduct() {
    barcodeResult.innerHTML = '';
    productDetails.innerHTML = '';

    scanButton.disabled = true;
    nextButton.disabled = true;
    finishButton.disabled = true;

    // Request camera permission and scan the barcode.
    try {
        const result = await CapacitorBarcodeScanner.scanBarcode({
            hint: CapacitorBarcodeScannerTypeHint.ALL,
        });

        const barcode = result?.ScanResult?.trim();

        if (!barcode) {
            barcodeResult.innerHTML = '<p>No barcode detected.</p>';
            scanButton.disabled = false;
            return;
        }

        totalScanned += 1;
        totalScannedCount.textContent = String(totalScanned);

        const barcodeParagraph = document.createElement('p');
        const barcodeLabel = document.createElement('strong');

        barcodeLabel.textContent = 'Barcode: ';

        barcodeParagraph.append(
            barcodeLabel,
            document.createTextNode(barcode)
        );

        barcodeResult.appendChild(barcodeParagraph);

        const product = products.find(
            (item) => String(item.product_id) === barcode
        );

        // Display product details and check for category/subcategory match.
        if (!product) {
            mismatchedProducts += 1;

            productDetails.innerHTML = `
                <div class="product-card mismatch-highlight">
                    <p>Product Not Found</p>
                    <h2>Product Mismatch</h2>
                </div>
            `;
        } else {
            // Temporary compatibility mapping for demo products.
            const categoryKey = product.category;
            const subcategoryKey = product.subCategory;

            // Find the actual category and subcategory based on the product's category and subcategory keys.
            /*const actualCategory = categories.find((category) =>
                category.name.toLowerCase() ===
                ({
                    babycare: 'baby care',
                    clothing: 'clothing',
                    toys: 'toys',
                }[categoryKey] ?? categoryKey.toLowerCase())
            );*/

            const actualCategory = categories.find(
                (item) => item.name === product.category_name
            );

            // Find the actual subcategory based on the product's subcategory key.
            /*const actualSubcategory =
                actualCategory?.subcategories?.find((subcategory) =>
                    subcategory.name.toLowerCase() ===
                    ({
                        diapers: 'diapers',
                        feeding: 'feeding',
                        boyswear: 'boys wear',
                        girlswear: 'girls wear',
                        softtoys: 'soft toys',
                        edutoys: 'educational toys',
                    }[subcategoryKey] ?? subcategoryKey.toLowerCase())
                );*/
            
            const actualSubcategory =
                actualCategory?.subcategories?.find(
                    (item) => item.name === product.subcategory_name
                );

            const selectedCategoryData =
                findCategory(categorySelect.value);

            const selectedSubcategoryData = findSubcategory(
                selectedCategoryData,
                subCategorySelect.value
            );

            const categoryMatches =
                actualCategory &&
                String(actualCategory.id) ===
                    String(selectedCategoryData?.id);

            const subcategoryMatches =
                actualSubcategory &&
                String(actualSubcategory.id) ===
                    String(selectedSubcategoryData?.id);

            const isMatch = Boolean(
                categoryMatches && subcategoryMatches
            );

            if (!isMatch) {
                mismatchedProducts += 1;
            } else {
                matchedProducts += 1;
            }

            const cardClass = isMatch
                ? 'product-card'
                : 'product-card mismatch-highlight';

            const title = isMatch
                ? product.name
                : 'Product Mismatch';

            const details = document.createElement('div');
            details.className = cardClass;

            const heading = document.createElement('h2');
            heading.textContent = title;
            details.appendChild(heading);

            if (!isMatch) {
                details.appendChild(document.createElement('hr'));
            }

            const productName = document.createElement('p');
            productName.innerHTML = '<strong>Product:</strong> ';
            productName.appendChild(
                document.createTextNode(product.product_name)
            );
            details.appendChild(productName);

            const actualCategoryParagraph =
                document.createElement('p');

            actualCategoryParagraph.innerHTML =
                '<strong>Actual Category:</strong> ';

            actualCategoryParagraph.appendChild(
                document.createTextNode(
                    actualCategory?.name ?? 'Unknown'
                )
            );

            details.appendChild(actualCategoryParagraph);

            const actualSubcategoryParagraph =
                document.createElement('p');

            actualSubcategoryParagraph.innerHTML =
                '<strong>Actual Sub Category:</strong> ';

            actualSubcategoryParagraph.appendChild(
                document.createTextNode(
                    actualSubcategory?.name ?? 'Unknown'
                )
            );

            details.appendChild(actualSubcategoryParagraph);

            const priceParagraph = document.createElement('p');
            priceParagraph.innerHTML = '<strong>Price:</strong> ';
            priceParagraph.appendChild(
                document.createTextNode(`₹${product.mrp}`)
            );
            details.appendChild(priceParagraph);

            const stockParagraph = document.createElement('p');
            stockParagraph.innerHTML = '<strong>Stock:</strong> ';
            stockParagraph.appendChild(
                document.createTextNode(String(product.quantity))
            );
            details.appendChild(stockParagraph);

            productDetails.appendChild(details);
        }

        scanButton.classList.add('hidden');
        nextButton.disabled = false;
        finishButton.disabled = false;
    } catch (error) {
        console.error('Barcode scan failed:', error);

        const message = document.createElement('p');
        const label = document.createElement('strong');

        label.textContent = 'Barcode scan failed: ';

        message.append(
            label,
            document.createTextNode(
                error?.message || 'Unable to scan the barcode.'
            )
        );

        barcodeResult.replaceChildren(message);

        nextButton.disabled = false;
        finishButton.disabled = false;
    }
}

// Scan the first product.
scanButton.addEventListener('click', scanProduct);

// Scan the next product.
nextButton.addEventListener('click', scanProduct);

// Finish scanning and display the summary.
finishButton.addEventListener('click', () => {
    barcodeResult.innerHTML = '';
    productDetails.innerHTML = '';

    scanButton.classList.add('hidden');
    nextButton.classList.add('hidden');
    finishButton.classList.add('hidden');

    scanningScreen.querySelector('.screen-header h2').textContent =
        'Summary';

    summary.innerHTML = `
        <div class="summary-card">
            <h2>Scan Summary</h2>
            <p><strong>Total Scanned Products:</strong>
                ${totalScanned}
            </p>
            <p><strong>Available Products:</strong>
                ${matchedProducts}
            </p>
            <p><strong>Not Available Products:</strong>
                ${mismatchedProducts}
            </p>
        </div>
    `;
});

// Logout.
logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;

    try {
        // Clear the authenticated session from local storage.
        await clearAuth();

        resetScan();
        resetSelection();

        accessToken = null;
        refreshToken = null;
        currentUser = null;
        categories = [];
        
        // Clear the category dropdown.
        populateCategories();

        loggedInUsername.textContent = '';
        loginError.textContent = '';
        loginError.classList.add('hidden');

        usernameInput.value = '';
        passwordInput.value = '';

        // Show the login screen after logging out.
        showScreen(loginScreen);
    } catch (error) {
        console.error('Logout failed:', error);
        alert('Unable to log out. Please try again.');
    } finally {
        logoutButton.disabled = false;
    }
});

// Restore session
async function restoreSession() {
    try {
        // Attempt to retrieve the authenticated session from local storage.
        const data = await getAuth();

        if (!data) {
            return false;
        }

        if ( !data.access || !data.refresh || !data.user ) {
            await clearAuth();
            return false;
        }

        // Store the authenticated session in memory.
        accessToken = data.access;
        refreshToken = data.refresh;
        currentUser = data.user;
        categories = data.categories;

        populateCategories();

        loggedInUsername.textContent = [
            currentUser.name,
            currentUser.store_name,
        ].filter(Boolean).join(' - ');

        // Reset selection and scanning data before showing the selection screen.
        resetSelection();
        resetScan();
        showScreen(selectionScreen);

        return true;
    } catch (error) {
        console.error('Failed to restore session:', error);
        return false;
    }
}

// Initialise the app.
async function initialiseApp() {
    loginError.textContent = '';
    loginError.classList.add('hidden');

    // Reset selection and scanning data before attempting to restore the session.
    resetSelection();
    resetScan();

    // Attempt to restore the authenticated session from local storage.
    const restored = await restoreSession();

    // If the session could not be restored, show the login screen.
    if (!restored) {
        populateCategories();
        showScreen(loginScreen);
    }
}

// Start the app.
initialiseApp();
