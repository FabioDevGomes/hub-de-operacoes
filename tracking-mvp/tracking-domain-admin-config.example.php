<?php
declare(strict_types=1);

/*
 * Exemplo sem segredo. A tela local do Hub gera o arquivo ativo com um token
 * aleatório de 256 bits. Mantenha tracking-domain-admin-config.php fora de
 * public_html e não o inclua no Git ou em pacotes públicos.
 */
return [
    'tracking_domain_admin_token' => 'PREENCHER_COM_64_CARACTERES_HEXADECIMAIS',
];
