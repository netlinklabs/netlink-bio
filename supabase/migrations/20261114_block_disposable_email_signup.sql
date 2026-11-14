-- Block signup from disposable email domains (already applied in production).
-- Add more domains with: INSERT INTO public.blocked_email_domains (domain) VALUES ('example.com');
CREATE TABLE IF NOT EXISTS public.blocked_email_domains (
  domain text PRIMARY KEY CHECK (domain = lower(domain))
);
ALTER TABLE public.blocked_email_domains ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blocked_email_domains FROM anon, authenticated;

INSERT INTO public.blocked_email_domains (domain)
SELECT unnest(string_to_array('10minutemail.be,10minutemail.cf,10minutemail.co.uk,10minutemail.co.za,10minutemail.com,10minutemail.de,10minutemail.ga,10minutemail.gq,10minutemail.ml,10minutemail.net,10minutemail.nl,10minutemail.pro,10minutemail.us,10minutemailbox.com,10minutemails.in,1secmail.com,1secmail.net,1secmail.org,1secmail.space,1secmail.website,burnermail.bond,burnermail.cyou,discard.cf,discard.email,discard.ga,discard.gq,discard.ml,discard.tk,discardmail.com,discardmail.de,dispostable.com,dropmail.me,emailondeck.com,emltmp.com,fakeinbox.cf,fakeinbox.com,fakeinbox.ga,fakeinbox.info,fakeinbox.ml,fakeinbox.tk,fldubai.com,getnada.cc,getnada.com,grr.la,guerrillamail.biz,guerrillamail.com,guerrillamail.de,guerrillamail.info,guerrillamail.net,guerrillamail.org,guerrillamailblock.com,inboxkitten.com,jetable.com,jetable.fr.nf,jetable.net,jetable.org,jetable.pp.ua,mailcatch.com,maildrop.cc,maildrop.cf,maildrop.ga,maildrop.gq,maildrop.ml,mailinator.co.uk,mailinator.com,mailinator.gq,mailinator.info,mailinator.net,mailinator.org,mailinator.us,mailinator0.com,mailinator1.com,mailinator2.com,mailinator2.net,mailinator3.com,mailinator4.com,mailinator5.com,mailinator6.com,mailinator7.com,mailinator8.com,mailinator9.com,mailnesia.com,mailtemp.info,mailtemple.xyz,mailtemporaire.com,mailtemporaire.fr,mintemail.com,minuteinbox.com,moakt.cc,moakt.co,moakt.com,moakt.ws,mohmal.com,mohmal.im,mohmal.in,mohmal.tech,mytemp.email,mytempemail.com,mytempmail.com,nada.email,nada.ltd,nadalshebaservices.com,sharklasers.com,spambox.info,spambox.me,spambox.org,spambox.us,temp-mail-free.dedyn.io,temp-mail.best,temp-mail.cfd,temp-mail.com,temp-mail.de,temp-mail.edu.rs,temp-mail.freeddns.org,temp-mail.gg,temp-mail.lol,temp-mail.now,temp-mail.org,temp-mail.pp.ua,temp-mail.ru,temp-mails.com,tempail.com,tempinbox.co.uk,tempinbox.com,tempmail.at,tempmail.au,tempmail.best,tempmail.cc,tempmail.cn,tempmail.co,tempmail.de,tempmail.email,tempmail.eu,tempmail.id.vn,tempmail.ing,tempmail.io.vn,tempmail.it,tempmail.ninja,tempmail.plus,tempmail.pp.ua,tempmail.us,tempmail.vip,tempmail.world,tempmail.ws,tempmail101.com,tempmail2.com,tempmail5.com,tempmaildemo.com,tempmailer.com,tempmailer.de,tempmailer.net,tempmailfree.net,tempmailnow.io,tempmailo.com,tempmailr.com,tempmails.net,tempmailto.com,tempmailyo.org,temporary-mail.net,tempr.email,throwaway.io,throwawayemailaddress.com,throwawaymail.com,throwawaymail.pp.ua,tmailor.com,tmailor.net,tmpmail.net,tmpmail.org,tmpmailtor.com,trashmail.at,trashmail.com,trashmail.de,trashmail.fr,trashmail.gq,trashmail.hu,trashmail.io,trashmail.me,trashmail.net,trashmail.org,trashmail.se,trashmail.ws,trashmailer.com,trashmailgenerator.de,trashmails.com,trbvm.com,yopmail.com,yopmail.fr,yopmail.gq,yopmail.kro.kr,yopmail.loseyourip.com,yopmail.net,yopmail.ooguy.com,yopmail.pp.ua,yopmail.theworkpc.com,yopmail.webredirect.org', ','))
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_disposable_email(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.blocked_email_domains b
    WHERE lower(split_part(coalesce(p_email, ''), '@', 2)) = b.domain
       OR lower(split_part(coalesce(p_email, ''), '@', 2)) LIKE '%.' || b.domain
  );
$$;
REVOKE ALL ON FUNCTION public.is_disposable_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_disposable_email(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.block_disposable_email_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF public.is_disposable_email(NEW.email) THEN
    RAISE EXCEPTION 'Please use a permanent email address.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_disposable_email_signup ON auth.users;
CREATE TRIGGER trg_block_disposable_email_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.block_disposable_email_signup();
