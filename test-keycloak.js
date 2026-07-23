const http = require('http');

const keycloakUrl = 'http://localhost:8080';
const realm = 'sunbird';
const path = `/realms/${realm}/.well-known/openid-configuration`;

console.log(`Checking Keycloak accessibility at: ${keycloakUrl}${path}`);

const options = {
    hostname: 'localhost',
    port: 8080,
    path: path,
    method: 'GET'
};

const req = http.request(options, (res) => {
    console.log('Status:', res.statusCode);

    if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('Success! Keycloak is accessible.');
        let data = '';
        res.on('data', (chunk) => {
            data += chunk;
        });
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                console.log('Issuer:', json.issuer);
            } catch (e) {
                console.log('Response body:', data);
            }
        });
    } else {
        console.error('Failed to connect to Keycloak. Status code:', res.statusCode);
        process.exit(1);
    }
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
    process.exit(1);
});

req.end();
